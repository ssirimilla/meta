import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let xScale, yScale;

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line), // or just +row.line
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {

      let first = lines[0];

      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,

        url:
          'https://github.com/ssirimilla/meta/commit/' +
          commit,

        author,
        date,
        time,
        timezone,
        datetime,

        hourFrac:
          datetime.getHours() +
          datetime.getMinutes() / 60,

        totalLines: lines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        writable: false,
        configurable: false,
        enumerable: false,
      });

      return ret;
    });
}

function renderCommitInfo(data, commits) {

  const dl = d3
    .select('#stats')
    .append('dl')
    .attr('class', 'stats');

  // Total LOC
  dl.append('dt')
    .html('Total <abbr title="Lines of code">LOC</abbr>');

  dl.append('dd')
    .text(data.length);

  // Total commits
  dl.append('dt')
    .text('Total commits');

  dl.append('dd')
    .text(commits.length);

  // Number of files
  dl.append('dt')
    .text('Number of files');

  dl.append('dd')
    .text(d3.group(data, d => d.file).size);

  // Average line length
  dl.append('dt')
    .text('Average line length');

  dl.append('dd')
    .text(
      d3.mean(data, d => d.length).toFixed(1)
    );

  // Maximum depth
  dl.append('dt')
    .text('Maximum depth');

  dl.append('dd')
    .text(
      d3.max(data, d => d.depth)
    );

  // Longest line
  dl.append('dt')
    .text('Longest line');

  dl.append('dd')
    .text(
      d3.max(data, d => d.length)
    );

  // Most active time of day
  const workByPeriod = d3.rollups(
    data,
    v => v.length,
    d =>
      new Date(d.datetime).toLocaleString(
        'en',
        { dayPeriod: 'short' }
      )
  );

  const maxPeriod =
    d3.greatest(workByPeriod, d => d[1])?.[0];

  dl.append('dt')
    .text('Most active time');

  dl.append('dd')
    .text(maxPeriod);
}

function createBrush(svg) {
  const brush = d3.brush().on('start brush end', brushed);

  svg.append('g')
    .call(brush);
}

function renderScatterPlot(data, commits) {

  const width = 1000;
  const height = 600;

  const margin = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 50,
  };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3.scaleTime()
  .domain(d3.extent(commits, d => d.datetime))
  .range([usableArea.left, usableArea.right])
  .nice();

yScale = d3.scaleLinear()
  .domain([0, 24])
  .range([usableArea.bottom, usableArea.top]);

  // Gridlines
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr(
      'transform',
      `translate(${usableArea.left}, 0)`
    );

  gridlines.call(
    d3
      .axisLeft(yScale)
      .tickFormat('')
      .tickSize(-usableArea.width)
  );

  // X axis
  const xAxis = d3.axisBottom(xScale);

  svg
    .append('g')
    .attr(
      'transform',
      `translate(0, ${usableArea.bottom})`
    )
    .call(xAxis);

  // Y axis
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat(
      d =>
        String(d % 24).padStart(2, '0') +
        ':00'
    );

  svg
    .append('g')
    .attr(
      'transform',
      `translate(${usableArea.left}, 0)`
    )
    .call(yAxis);

  // Dots
  const dots = svg
    .append('g')
    .attr('class', 'dots');

  dots
  .selectAll('circle')
  .data(commits)
  .join('circle')
  .attr('cx', d => xScale(d.datetime))
  .attr('cy', d => yScale(d.hourFrac))
  .attr('r', 5)
  .attr('fill', 'steelblue')
  .style('pointer-events', 'all') // Ensures the circle catches the event
  .on('mouseenter', function (event, commit) {
    d3.select(this).style('fill', 'orange'); // Optional: visual feedback
    updateTooltipVisibility(true);
    updateTooltipPosition(event);
    renderTooltipContent(commit); // Changed 'd' to 'commit'
  })
  .on('mousemove', (event) => {
    updateTooltipPosition(event);
  })
  .on('mouseleave', function () {
    d3.select(this).style('fill', 'steelblue'); // Reset color
    updateTooltipVisibility(false);
  });

    
}

function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (!commit || !Object.keys(commit).length) return;

  link.href = commit.url;
  link.textContent = commit.id;

  date.textContent = commit.datetime?.toLocaleDateString('en', {
    dateStyle: 'full',
  });

  time.textContent = commit.datetime?.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX + 10}px`;
  tooltip.style.top = `${event.clientY + 10}px`;
}

function brushed(event) {
  const selection = event.selection;

  d3.selectAll('circle')
    .classed('selected', d =>
      isCommitSelected(selection, d)
    );

  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;

  const [[x0, y0], [x1, y1]] = selection;

  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selected = selection
    ? commits.filter(d => isCommitSelected(selection, d))
    : [];

  document.querySelector('#selection-count')
    .textContent =
      selected.length || 'No' + ' commits selected';
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter(d => isCommitSelected(selection, d))
    : [];

  const container = document.getElementById('language-breakdown');

  if (!selectedCommits.length) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap(d => d.lines);

  const breakdown = d3.rollup(
    lines,
    v => v.length,
    d => d.type
  );

  container.innerHTML = '';

  for (const [lang, count] of breakdown) {
    const pct = d3.format('.1~%')(count / lines.length);

    container.innerHTML += `
      <dt>${lang}</dt>
      <dd>${count} lines (${pct})</dd>
    `;
  }
}

let data = await loadData();

let commits = processCommits(data);

renderCommitInfo(data, commits);

renderScatterPlot(data, commits);



window.data = data;

window.commits = commits;

window.d3 = d3;