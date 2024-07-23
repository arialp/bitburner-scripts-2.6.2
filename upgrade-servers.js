// file: upgrade-servers.js

import { requestFunds } from "playerAction.js"
/** @param {NS} ns **/
export async function main(ns) {
	// Disable default Logging
	ns.disableLog("ALL");

	const stockValuePort = ns.getPortHandle(4);
	const stockActionPort = ns.getPortHandle(5);
	var notAllServersMaxed = true;
	const ramLimit = ns.getPurchasedServerMaxRam();
	var maxPurchaseableRam = ns.getServerMaxRam("home") / 2;  // we would not buy less than half home RAM
	if (maxPurchaseableRam > ramLimit) {
		maxPurchaseableRam = ramLimit;
	}
	ns.print("Initial RAM tier: " + ns.formatRam(maxPurchaseableRam));
	while (notAllServersMaxed) {
		var stockValue = stockValuePort.peek() === "NULL PORT DATA" ? 0 : stockValuePort.peek();
		var player = ns.getPlayer();
		var ownedServers = ns.getPurchasedServers();
		ownedServers.sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a));
		if (ownedServers.length > 0) {
			// never buy for less than we already have
			maxPurchaseableRam = Math.max(maxPurchaseableRam, ns.getServerMaxRam(ownedServers[0]));
		}

		var ramUpgradeCost = ns.getPurchasedServerCost(maxPurchaseableRam);

		// see if we can afford a higher RAM tier than we already have
		while (maxPurchaseableRam < ramLimit) {
			player = ns.getPlayer();
			// check for quadruple RAM for not too big jumps and buffer for another potential double RAM afterwards below
			var nextRamTier = maxPurchaseableRam * 4;
			var nextRamTierCost = ns.getPurchasedServerCost(nextRamTier);
			if (player.money + stockValue * 0.5 > nextRamTierCost) {
				// double RAM
				maxPurchaseableRam *= 2;
			}
			else {	// we found the max affordable ram tier
				break;
			}
		}

		while (ownedServers.length < ns.getPurchasedServerLimit()) {
			player = ns.getPlayer();
			if ((ownedServers.length == 7 || ownedServers.length == 14 || ownedServers.length == 21) && maxPurchaseableRam * 2 < ramLimit) {
				// switch to a higher RAM tier after 10 servers, so we got the second 10 at 50% and the last 5 at 25%
				// - make a substantial impact (the increase would be < 10%)
				// - reduce the money lost by deleting servers often
				// - reduce the impact of killing running threads by having the last 5 servers with 1/4 RAM
				// 		and "baiting" threads to the high RAM servers so that the last small ones have low utilization. 
				maxPurchaseableRam *= 2
				ramUpgradeCost = ns.getPurchasedServerCost(maxPurchaseableRam);
			}

			// ns.print("money: " + Math.round(ns.getPlayer().money / 1000000) + "m cost: " + Math.round(ramUpgradeCost / 1000000) + " m")
			if (await requestFunds(ns, player, ramUpgradeCost)) {
				const newServer = ns.purchaseServer("pserv-" + ownedServers.length, maxPurchaseableRam);
				stockActionPort.write(JSON.stringify(['ACK', true]));
				if (newServer == "") continue;
				ownedServers.push(newServer);
				ns.print("Purchased Server " + newServer + " with " + ns.formatRam(maxPurchaseableRam) + " RAM for " + ns.formatNumber(ramUpgradeCost));
				ns.tprint("Purchased Server " + newServer + " with " + ns.formatRam(maxPurchaseableRam) + " RAM for " + ns.formatNumber(ramUpgradeCost));
			}
			await ns.sleep(500);
		}

		//ns.tprint(ownedServers);
		//ns.print("maxPurchaseableRam: " + maxPurchaseableRam)
		//ns.print("RamCost: " + ns.getPurchasedServerCost(maxPurchaseableRam))

		while (ownedServers.length > 0 && player.money + stockValue * 0.5 > ramUpgradeCost) {
			player = ns.getPlayer();
			var upgradeServer = ownedServers.pop();
			var upgradeServerRAM = ns.getServerMaxRam(upgradeServer);
			if (upgradeServerRAM >= ramLimit) {
				ns.print("All servers at max RAM");
				ns.tprint("All servers at max RAM");
				notAllServersMaxed = false;
				return;
			}
			else if (upgradeServerRAM >= maxPurchaseableRam) {
				// we would not actually upgrade the ram of the server. 
				// Since sorted, all remaining serers would not have less, so we an stop.
				break;
			}
			else {
				if (maxPurchaseableRam * 2 <= ramLimit && ownedServers.length > 6) {
					if (upgradeServerRAM <= ns.getServerMaxRam(ownedServers[6]) * 2) {
						// switch to double RAM after x servers, so we got the second / third set of servers sizes 
						// this looks typically like: servers 0-6: 64 GB; servers 7-13: 32 GB; servers 14-20: 16 GB; servers 21-24: 8 GB
						// - reduce the money lost by deleting servers often
						// - reduce the impact of killing running threads by having the last servers with lower RAM
						// 		and "baiting" threads to the high RAM servers so that the last small ones have low utilization. 
						maxPurchaseableRam *= 2;
						ramUpgradeCost = ns.getPurchasedServerCost(maxPurchaseableRam);
						ns.print("Double RAM tier: " + ns.formatRam(maxPurchaseableRam));
						if (player.money + stockValue * 0.5 < ramUpgradeCost) {
							// we should switch to a higher RAM tier but cannot afford it. Wait for more money.
							return;
						}
					}
				}
				if (await requestFunds(ns, player, ramUpgradeCost)) {
					ns.print(`Upgrade server ${upgradeServer} RAM from ${ns.formatRam(upgradeServerRAM)} to ${ns.formatRam(maxPurchaseableRam)} for ${ns.formatNumber(ramUpgradeCost)}`);
					ns.tprint(`Upgrade server ${upgradeServer} RAM from ${ns.formatRam(upgradeServerRAM)} to ${ns.formatRam(maxPurchaseableRam)} for ${ns.formatNumber(ramUpgradeCost)}`);
					ns.killall(upgradeServer);
					ns.deleteServer(upgradeServer);
					const newServer = ns.purchaseServer(upgradeServer, maxPurchaseableRam);
					stockActionPort.write(JSON.stringify(['ACK', true]));
					if (newServer == "") continue;
				}
			}
			player = ns.getPlayer();
		}
		await ns.sleep(5 * 1000);
	}
}