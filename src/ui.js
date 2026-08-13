const supportsColor = process.stdout.isTTY;

function wrap(code) {
  return (s) => (supportsColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
}

const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  green: wrap("32"),
  cyan: wrap("36"),
  yellow: wrap("33"),
  red: wrap("31"),
  magenta: wrap("35"),
};

function header(title) {
  const line = "─".repeat(Math.max(title.length + 4, 10));
  console.log(`\n${c.dim(line)}\n${c.bold(c.cyan(`  ${title}`))}\n${c.dim(line)}`);
}

function success(msg) {
  console.log(`${c.green("✔")} ${msg}`);
}

function info(msg) {
  console.log(`${c.dim("›")} ${msg}`);
}

function warn(msg) {
  console.log(`${c.yellow("⚠")} ${msg}`);
}

function fail(msg) {
  console.error(`${c.red("✘")} ${msg}`);
}

function progressLine(done, total, label = "") {
  const width = 28;
  const pct = total ? done / total : 0;
  const filled = Math.round(width * pct);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  process.stdout.write(
    `\r  ${c.cyan(bar)} ${String(done).padStart(String(total || 0).length)}/${total ?? "?"} ${c.dim(label)}`
  );
}

function table(rows) {
  if (!rows.length) return;
  const nameWidth = Math.max(...rows.map((r) => r.name.length)) + 2;
  for (const r of rows) {
    const countStr = c.dim(`${r.count} tracks`);
    console.log(`  ${r.name.padEnd(nameWidth)} ${countStr}`);
  }
}

module.exports = { c, header, success, info, warn, fail, progressLine, table };
