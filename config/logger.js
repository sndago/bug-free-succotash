const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

const stamp = () => {
  const now = new Date();
  return `${c.dim}${now.toLocaleTimeString('en-US', { hour12: false })}${c.reset}`;
};

const logger = {
  banner(port) {
    const env = process.env.NODE_ENV || 'development';
    console.log(`
${c.cyan}${c.bold}  ╔══════════════════════════════════════╗
  ║                                      ║
  ║   ▲  C O N E   B A C K E N D        ║
  ║                                      ║
  ╚══════════════════════════════════════╝${c.reset}

  ${c.dim}┌─────────────────────────────────────┐${c.reset}
  ${c.dim}│${c.reset}  ${c.bold}${c.white}Env${c.reset}     ${c.yellow}${env.padEnd(28)}${c.reset}${c.dim}│${c.reset}
  ${c.dim}│${c.reset}  ${c.bold}${c.white}Port${c.reset}    ${c.cyan}${String(port).padEnd(28)}${c.reset}${c.dim}│${c.reset}
  ${c.dim}│${c.reset}  ${c.bold}${c.white}URL${c.reset}     ${c.green}http://localhost:${port}${' '.repeat(12 - String(port).length)}${c.reset}${c.dim}│${c.reset}
  ${c.dim}└─────────────────────────────────────┘${c.reset}
`);
  },

  success(msg) {
    console.log(`  ${stamp()}  ${c.green}✔${c.reset}  ${msg}`);
  },

  info(msg) {
    console.log(`  ${stamp()}  ${c.cyan}◆${c.reset}  ${msg}`);
  },

  warn(msg) {
    console.log(`  ${stamp()}  ${c.yellow}⚠${c.reset}  ${c.yellow}${msg}${c.reset}`);
  },

  error(msg, err) {
    console.log(`  ${stamp()}  ${c.red}✖${c.reset}  ${c.red}${msg}${c.reset}`);
    if (err) console.log(`          ${c.dim}${err}${c.reset}`);
  },

  request(method, path, status, ms) {
    const statusColor = status >= 500 ? c.red : status >= 400 ? c.yellow : c.green;
    const methodColor = { GET: c.cyan, POST: c.magenta, PUT: c.yellow, DELETE: c.red, PATCH: c.blue };
    const col = methodColor[method] || c.white;
    console.log(
      `  ${stamp()}  ${col}${method.padEnd(7)}${c.reset}  ${c.white}${path.padEnd(30)}${c.reset}  ${statusColor}${status}${c.reset}  ${c.dim}${ms}ms${c.reset}`
    );
  },
};

module.exports = logger;
