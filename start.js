/** @param {NS} ns */

export async function main(ns) {
	const hudScriptName = "customHud.js";
	const getRamScriptName = "get-ram-usage.js"
	const ipvgoScriptName = "ipvgo.js";
	const upgradeScriptName = "upgrade-servers.js";
	const corpScriptName = "corp.js";
	const earlyStockName = "early-stock-trader.js";
	const stockName = "stock-trader.js";
	const actionScriptName = "playerAction.js";
	const deployScriptName = "distributed-hack.js";

	const tix = ns.stock.has4SDataTIXAPI();
	const ram = ns.getServerMaxRam("home");

	if (ram > 16 && !ns.isRunning(hudScriptName, "home")) {
		ns.run(hudScriptName);
		ns.run(getRamScriptName);
	}

	if (ram > 32 && !ns.isRunning(ipvgoScriptName, "home")) {
		ns.run(ipvgoScriptName);
	}

	if (ram >= 64 && !ns.isRunning(upgradeScriptName, "home")) {
		ns.run(upgradeScriptName);
		if (tix) ns.tail(ns.run(stockName));
		else ns.tail(ns.run(earlyStockName));
	}

	if (ram >= 1024 && !ns.isRunning(corpScriptName, "home")) {
		ns.tail(ns.run(corpScriptName));
	}

	if (ram >= 2048 && !ns.isRunning(actionScriptName, "home")) {
		ns.tail(ns.run(actionScriptName));
	}

	if (!ns.isRunning(deployScriptName, "home")) {
		ns.tail(ns.run(deployScriptName, { threads: 1, spawnDelay: 100 }));
	}
}