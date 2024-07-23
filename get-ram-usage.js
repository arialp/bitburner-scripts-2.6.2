const RED = "\u001b[31m";
const BLUE = "\u001b[34m";
const WHITE_CYAN = "\u001b[37;46m";
const RED_YELLOW = "\u001b[31;43m";
const PINK = "\u001b[38;5;201m";
const LAVENDER = "\u001b[38;5;147m";
const AQUA = "\u001b[38;2;145;231;255m";
const PENCIL = "\u001b[38;2;253;182;0m";
const RESET = "\u001b[0m";
var totalRamUsage;

/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");
	ns.tail();
	ns.resizeTail(550,28*13);

	let scriptData = new Map(); // [[scriptName, total-ram-used-by-this-script-on-every-server], ...]
	let sortedScriptData = new Map();
	let hosts = new Map();
	hosts.set("home", ns.getServerMaxRam("home"));
	const servers = getAllHosts(ns, "home", hosts); // [[server, ramMax], ...]

	while (true) {
		ns.clearLog();
		hosts.set("home", ns.getServerMaxRam("home"));
		let totalRam = [...servers.values()].reduce((a, b) => a + b, 0);
		totalRamUsage = 0;
		scriptData.clear();

		[...servers.keys()].map((server) => {if(ns.ps(server).length > 0) ns.ps(server).map((script) => scriptData.set(script.filename, (scriptData.get(script.filename) ? scriptData.get(script.filename) : 0) + ns.getRunningScript(script.pid).ramUsage * script.threads))});

		sortedScriptData = new Map([...scriptData.entries()].sort((a, b) => a[1] - b[1]));
		
		printer(ns, sortedScriptData, totalRam);

		await ns.sleep(500);
	}
}

/** 
 * Prints a given Map.
 * @param {NS} ns 
 * @param {Map} data
 * @param {Number} maxValue
 * */
function printer(ns, data, maxValue) {
	totalRamUsage = [...data.values()].reduce((a, b) => a + b, 0);
	totalRamUsage = totalRamUsage >= maxValue ? maxValue : totalRamUsage;
	for (const [key, value] of data.entries()) {
		let key_ = key;
		let value_ = value >= maxValue ? maxValue : value;
		const fillBar = getFillBar(value_, maxValue);
		const color = (key === 'weaken.js' || key === 'grow.js' || key === 'hack.js') ? RED : LAVENDER;

		if (key.length < 8) key_ += '\t';
		if (key.length < 16) key_ += '\t';
		
		ns.print(`${color}${key_}\t${ns.formatRam(value_, 1)}\t ${PENCIL}[${fillBar}]${RESET}`);
	}
	const totalFillBar = getFillBar(totalRamUsage, maxValue);
	ns.print(`${AQUA}Total RAM Usage\t\t${ns.formatRam(totalRamUsage, 1)}\t ${WHITE_CYAN}[${totalFillBar}]${RESET}`);
}

/** @param {NS} ns */
function getFillBar(value, maxValue) {
  const barLength = 20;
  const filledLength = Math.round((value / maxValue) * barLength);
  const emptyLength = barLength - filledLength;
  const filledBar = '='.repeat(filledLength);
  const emptyBar = ' '.repeat(emptyLength);
  return `${filledBar}${emptyBar}`;
}

/** 
 * Gets all hostnames.
 * @param {NS} ns 
 * @param {string[]} hosts
 * @param {Map} servers
 * @returns {Map} servers
 * */
function getAllHosts(ns, hosts, servers) {
	var hosts = ns.scan(hosts);
	for (let i = 0; i < hosts.length; i++) {
		if (!servers.has(hosts[i])) {
			servers.set(hosts[i], ns.getServerMaxRam(hosts[i]));
			getAllHosts(ns, hosts[i], servers);
		}
	}
	return servers;
}
