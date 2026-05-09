
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let xScale, yScale, rScale;

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
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
        url: 'https://github.com/ssirimilla/meta/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
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
  const container = d3.select('#stats').html(''); // Clear previous
  const dl = container.append('dl').attr('class', 'stats');

  const stats = [
    { label: 'Total LOC', value: data.length, isAbbr: true },
    { label: 'Total commits', value: commits.length },
    { label: 'Number of files', value: d3.group(data, d => d.file).size },
    { label: 'Average line length', value: d3.mean(data, d => d.length).toFixed(1) },
    { label: 'Maximum depth', value: d3.max(data, d => d.depth) },
    { label: 'Longest line', value: d3.max(data, d => d.length) }
  ];

  stats.forEach(s => {
    dl.append('dt').html(s.isAbbr ? 'Total <abbr title="Lines of code">LOC</abbr>' : s.label);
    dl.append('dd').text(s.value);
  });

  const workByPeriod = d3.rollups(data, v => v.length, d => 
    new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' })
  );
  const maxPeriod = d3.greatest(workByPeriod, d => d[1])?.[0];

  dl.append('dt').text('Most active time');
  dl.append('dd').text(maxPeriod);
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 50 };

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
    .html('') // Clear previous
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

  // Size scale: Proportional to lines edited (Area-based)
  const [minLines, maxLines] = d3.extent(commits, d => d.totalLines);
  rScale = d3.scaleSqrt()
    .domain([minLines, maxLines])
    .range([2, 30]); // Dots will be between 2px and 30px radius

  // Gridlines
  svg.append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Axes
  svg.append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));

  svg.append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat(d => String(d % 24).padStart(2, '0') + ':00'));

  // IMPORTANT: The brush must be added BEFORE the dots so it is "behind" them
  // This allows the dots to receive mouse events while the brush still works on the background
  const brushGroup = svg.append('g').attr('class', 'brush');
  const brush = d3.brush()
    .on('start brush end', (event) => brushed(event, commits));
  brushGroup.call(brush);

  const dots = svg.append('g').attr('class', 'dots');

  dots.selectAll('circle')
    .data(commits)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines)) // Proportional size
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1).attr('stroke', 'black');
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => {
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7).attr('stroke', 'none');
      updateTooltipVisibility(false);
    });
}

function renderTooltipContent(commit) {
  const fields = {
    'commit-link': { text: commit.id, href: commit.url },
    'commit-date': { text: commit.datetime?.toLocaleDateString('en', { dateStyle: 'full' }) },
    'commit-time': { text: commit.datetime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    'commit-author': { text: commit.author },
    'commit-lines': { text: commit.totalLines }
  };

  for (const [id, data] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = data.text;
      if (data.href) el.href = data.href;
    }
  }
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  if (tooltip) tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  if (tooltip) {
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY + 15}px`;
  }
}

function brushed(event, commits) {
  const selection = event.selection;
  const selectedCommits = !selection ? [] : commits.filter(commit => {
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    return x >= selection[0][0] && x <= selection[1][0] && 
           y >= selection[0][1] && y <= selection[1][1];
  });

  d3.selectAll('circle').classed('selected', commit => {
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    return selection && x >= selection[0][0] && x <= selection[1][0] && 
           y >= selection[0][1] && y <= selection[1][1];
  });

  renderSelectionCount(selectedCommits);
  renderLanguageBreakdown(selectedCommits);
}

function renderSelectionCount(selectedCommits) {
  const countEl = document.querySelector('#selection-count');
  if (countEl) {
    countEl.textContent = `${selectedCommits.length || 'No'} commits selected`;
  }
}

function renderLanguageBreakdown(selectedCommits) {
  const container = document.getElementById('language-breakdown');
  if (!container) return;
  container.innerHTML = '';

  if (selectedCommits.length === 0) return;

  const lines = selectedCommits.flatMap(d => d.lines);
  const breakdown = d3.rollup(lines, v => v.length, d => d.type);

  for (const [lang, count] of breakdown) {
    const pct = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `<dt>${lang}</dt><dd>${count} lines (${pct})</dd>`;
  }
}

// Initial Kickoff
const rawData = await loadData();
const processedCommits = processCommits(rawData);

renderCommitInfo(rawData, processedCommits);
renderScatterPlot(rawData, processedCommits);