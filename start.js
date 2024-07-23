/** @param {NS} ns */

export async function main(ns) {
	const hudScriptName = "customHud.js";
	const getRamScriptName = "get-ram-usage.js"
	const ipvgoScriptName = "ipvgo.js";
	const upgradeScriptName = "upgrade-servers.js";
	const earlyStockName = "early-stock-trader.js";
	const stockName = "stock-trader.js";
	const actionScriptName = "playerAction.js";
	const deployScriptName = "distributed-hack.js";

	const tix = ns.stock.has4SDataTIXAPI();

	if (ns.getServerMaxRam("home") > 16 && !ns.isRunning(hudScriptName, "home")) {
		ns.run(hudScriptName);
		ns.run(getRamScriptName);
	}

	if (ns.getServerMaxRam("home") > 32 && !ns.isRunning(ipvgoScriptName, "home")) {
		ns.run(ipvgoScriptName);
	}

	if (ns.getServerMaxRam("home") >= 64 && !ns.isRunning(upgradeScriptName, "home")) {
		ns.run(upgradeScriptName);
		if (tix) ns.tail(ns.run(stockName));
		else ns.tail(ns.run(earlyStockName));
	}

	if (ns.getServerMaxRam("home") >= 256 && !ns.isRunning(actionScriptName, "home")) {
		ns.tail(ns.run(actionScriptName));
	}

	if (!ns.isRunning(deployScriptName, "home")) {
		ns.tail(ns.run(deployScriptName, { threads: 1, spawnDelay: 100 }));
	}
}