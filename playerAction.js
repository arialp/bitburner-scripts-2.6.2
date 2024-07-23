var estimatedRepPerSecond = 0;
/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");
	var player = ns.getPlayer();
	ns.clearPort(5); // flush port 5 in case of stuck commands
	while (true) {
		var augmentationCostMultiplier = 1.9;
		/**  
		 * starting from 1.9 because cost calculation
		 * will act as if goalAugmentation is in augmentationsToBuy already
		 * */

		player = ns.getPlayer();
		ns.clearLog();

		// Estimating reputation gain rate per second without Formulas.exe
		// its fairly accurate but sometimes gives a nonsense number
		// it uses the already spent sleepTime so it doesn't waste more time
		// Average error across 1000 data points: 2.82%
		let factionName = "";
		let calculateRepPerSecond = false;
		const currentWork = ns.singularity.getCurrentWork();
		if (currentWork && currentWork.type == "FACTION" && !ns.fileExists("Formulas.exe", "home")) {
			factionName = currentWork.factionName;
			calculateRepPerSecond = true;
		}
		let prevRep = 0;
		if (calculateRepPerSecond) {
			prevRep = ns.singularity.getFactionRep(factionName);
		}

		const start = new Date();
		await getPrograms(ns);
		await joinFactions(ns);
		await buyAugments(ns, augmentationCostMultiplier);
		await upgradeHomeServer(ns);
		const end = new Date();
		const timeSlept = end.getTime() - start.getTime();

		let extraSleep = 0;
		let prevERPS = estimatedRepPerSecond;
		estimatedRepPerSecond = 0;
		let thresholdCount = 0;
		const thresholdLimit = 3;
		const threshold = prevERPS * 0.05;

		if (calculateRepPerSecond) {
			// make sure we slept at least 1s
			if (timeSlept < 1000) {
				extraSleep = 1000 - timeSlept;
				await ns.sleep(extraSleep);
				var curRep = ns.singularity.getFactionRep(factionName);
				estimatedRepPerSecond = (curRep - prevRep);
			} else {
				var curRep = ns.singularity.getFactionRep(factionName);
				estimatedRepPerSecond = (curRep - prevRep) / (timeSlept / 1000);
			}
			// threshold system for rejecting false estimates
			if (Math.abs(estimatedRepPerSecond - prevERPS) > threshold) {
				thresholdCount++;
				if (thresholdCount >= thresholdLimit) {
					prevERPS = estimatedRepPerSecond;
					thresholdCount = 0;
				}
			} else {
				thresholdCount = 0;
				estimatedRepPerSecond = prevERPS;
			}
		}

		const sleepTime = 5000 - timeSlept - extraSleep;


		const factionsForReputation = getFactionsForReputation(ns, player);
		ns.print("Factions for Reputation: " + [...factionsForReputation.keys()]);

		const actionUseful = currentActionUseful(ns, player, factionsForReputation);
		ns.print("Current action useful: " + actionUseful);

		if (!actionUseful) {
			chooseAction(ns, player, factionsForReputation);
		}

		await ns.sleep(Math.max(100, sleepTime));
	}
}

/** 
 * Upgrades the home server's RAM and Cores.
 * @param {NS} ns
 * @param {Player} player 
 **/
export async function upgradeHomeServer(ns) {
	const stockActionPort = ns.getPortHandle(5);
	const has4STIX = ns.stock.has4SDataTIXAPI();

	let player = ns.getPlayer();

	if (!has4STIX && player.money > 40e9) {
		ns.stock.purchase4SMarketDataTixApi();
		ns.stock.purchase4SMarketData();
	}

	const upgradeHomeRam = async () => {
		const ramUpgradeCost = ns.singularity.getUpgradeHomeRamCost();
		if (ns.getServerMaxRam("home") >= Math.pow(2, 30)) return false;
		if (await requestFunds(ns, ramUpgradeCost)) {
			const ramUpgradeSuccess = ns.singularity.upgradeHomeRam();
			if (ramUpgradeSuccess) {
				ns.print(`INFO Upgraded home RAM to ${ns.formatRam(ns.getServerMaxRam("home"))}`);
				ns.toast(`Upgraded home RAM to ${ns.formatRam(ns.getServerMaxRam("home"))}`, `info`);
			} else {
				ns.print(`ERROR Could not upgrade home RAM!`);
				ns.toast(`Could not upgrade home RAM!`, `error`);
			}
			stockActionPort.write(JSON.stringify(['ACK', ramUpgradeSuccess]));
			return ramUpgradeSuccess;
		} else return false;
	}

	const upgradeHomeCores = async () => {
		const coreUpgradeCost = ns.singularity.getUpgradeHomeCoresCost();
		if (ns.getServer("home").cpuCores >= 8) return false;
		if (await requestFunds(ns, coreUpgradeCost)) {
			const coreUpgradeSuccess = ns.singularity.upgradeHomeCores();
			if (coreUpgradeSuccess) {
				ns.print(`INFO Upgraded home cores to ${ns.getServer("home").cpuCores}`);
				ns.toast(`Upgraded home cores to ${ns.getServer("home").cpuCores}`, `info`);
			} else {
				ns.print(`ERROR Could not upgrade home cores!`);
				ns.toast(`Could not upgrade home cores!`, `error`);
			}
			stockActionPort.write(JSON.stringify(['ACK', coreUpgradeSuccess]));
			return coreUpgradeSuccess;
		} else return false;
	}

	// Upgrade Home RAM
	await upgradeHomeRam();

	// Upgrade Home Cores
	await upgradeHomeCores();
}

/** 
 * Purchases necessary programs.
 * @param {NS} ns
 * @param {Player} player 
 * @returns {Promise<boolean>} true if no errors,
 * false if tor purchase failed
 **/
export async function getPrograms(ns) {
	const stockActionPort = ns.getPortHandle(5);
	const programs = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "ServerProfiler.exe", "DeepscanV1.exe", "DeepscanV2.exe", "AutoLink.exe", "Formulas.exe"];
	const programCosts = {
		"BruteSSH.exe": 500e3,
		"FTPCrack.exe": 1500e3,
		"relaySMTP.exe": 5e6,
		"HTTPWorm.exe": 30e6,
		"SQLInject.exe": 250e6,
		"ServerProfiler.exe": 500e3,
		"DeepscanV1.exe": 500e3,
		"DeepscanV2.exe": 25e6,
		"AutoLink.exe": 1e6,
		"Formulas.exe": 5e9,
	};

	if (!ns.hasTorRouter()) {
		if (await requestFunds(ns, 1e6)) {
			const torSuccess = ns.singularity.purchaseTor();
			if (torSuccess) {
				ns.print("SUCCESS Purchased TOR");
				ns.toast("Purchased TOR", "success");
			} else {
				ns.print("ERROR Could not purchase TOR!");
				ns.toast("Purchased TOR", "error");
			}
			stockActionPort.write(JSON.stringify(['ACK', torSuccess]));
			if (!torSuccess) return false;
		} else return false;
	}


	if (ns.stock.has4SDataTIXAPI()) {
		programs.push("HTTPWorm.exe", "SQLInject.exe");
	}

	for (const program of programs) {
		if (ns.fileExists(program)) continue;
		if (await requestFunds(ns, programCosts[program])) {
			const progSuccess = ns.singularity.purchaseProgram(program);
			if (progSuccess) {
				ns.print(`SUCCESS Purchased ${program}`);
				ns.toast(`Purchased ${program}`, `success`);
			} else {
				ns.print(`ERROR Could not purchase ${program}`);
				ns.toast(`Could not purchase ${program}`, `error`);
			}
			stockActionPort.write(JSON.stringify(['ACK', progSuccess]));
		}
	}
	return true;
}

/** 
 * Decides the next action for the player.
 * @param {NS} ns
 * @param {Player} player
 * @param {Map} factions
 * @returns {number} The adjusted sleep time
 **/
function chooseAction(ns, player, factions) {
	const focus = ns.singularity.isFocused();
	const currentWork = ns.singularity.getCurrentWork();
	if (ns.getHackingLevel() < studyUntilHackLevel) {
		ns.singularity.universityCourse("rothman university", "Study Computer Science", focus);
	} else if (factions.size > 0) {
		const faction = factions.keys().next().value;
		const factionsFieldWork = ["Slum Snakes", "Tetrads"];
		const workType = factionsFieldWork.includes(faction) ? "field" : "hacking";
		const success = ns.singularity.workForFaction(faction, workType, focus);
		if (success) {
			ns.print(`INFO Start working for ${faction}`);
			ns.toast(`Start working for ${faction}`, `info`, 5000);
		} else {
			ns.print(`Could not perform intended action: ${faction} -> ${workType}`);
		}
	} else if (player.skills.hacking >= 250) {
		const corpsToWorkFor = getCorpsForReputation(ns, player);
		//ns.print(corpsToWorkFor);
		if (corpsToWorkFor.length > 0) {
			applyForPromotion(ns, corpsToWorkFor[0]);
			ns.print(`INFO Start working for ${corpsToWorkFor[0]}`);
			ns.toast(`Start working for ${corpsToWorkFor[0]}`, `info`);
		}
	} else if (currentWork.type !== "CRIME") {
		const crimeTime = commitCrime(ns, player);
		return crimeTime;
	}
	return;
}

/** 
 * Applies for a promotion and starts working for the company.
 * @param {NS} ns
 * @param {string} corp 
 **/
function applyForPromotion(ns, corp) {
	const career = "IT";
	const success = ns.singularity.applyToCompany(corp, career);
	if (success) {
		ns.toast("Got a company promotion!");
	}
	ns.singularity.workForCompany(corp, ns.singularity.isFocused());
}

/** 
 * Checks if the current action is useful.
 * @param {NS} ns
 * @param {Player} player
 * @param {Map} factionsForReputation 
 * @returns {boolean}
 **/
function currentActionUseful(ns, player, factions) {
	const playerControlPort = ns.getPortHandle(3);
	const currentWork = ns.singularity.getCurrentWork();
	if (currentWork && currentWork.type == "FACTION") {
		const faction = currentWork.factionName;
		if (factions.has(faction)) {
			const factionWork = currentWork.factionWorkType;
			const factionFavor = ns.singularity.getFactionFavor(faction);
			const repRemaining = factions.get(faction);
			const repPerSecond = ns.fileExists("Formulas.exe", "home") ? ns.formulas.work.factionGains(player, factionWork, factionFavor).reputation * 5 : estimatedRepPerSecond;
			const repTimeRemaining = repRemaining / repPerSecond ?? 0;

			if (repRemaining > 0) {
				if (playerControlPort.empty() && factionWork == "hacking") {
					ns.print("ns.share() to increase faction reputation");
					playerControlPort.write(true);
				} else if (playerControlPort.empty()) {
					playerControlPort.write(false);
				}
				ns.print(`INFO Reputation remaining: ${ns.formatNumber(repRemaining, 3)} in ${ns.formatNumber(repTimeRemaining / 60, 0, 100000)} min`);
				return true;
			} else {
				ns.print(`INFO Max reputation @${faction}`);
				ns.toast(`Max reputation @${faction}`, `info`, 5000);
				return false;
			}
		} else {
			if (playerControlPort.empty()) {
				playerControlPort.write(false);
			}
		}
	} else {
		if (playerControlPort.empty()) {
			playerControlPort.write(false);
		}
	}
	if (currentWork && currentWork.type == "COMPANY" && currentWork.companyName !== "") {
		const reputationGoal = 200000;
		const reputation = ns.singularity.getCompanyRep(currentWork.companyName);
		const corpsToWorkFor = getCorpsForReputation(ns, player);
		ns.print(`Company reputation: ${ns.formatNumber(reputation, 3)}`);
		if (!corpsToWorkFor.includes(currentWork.companyName)) {
			// if we have unlocked company faction, stop working for company
			return false;
		}
		if (factions.size > 0) {
			// prioritize factions for rep
			return false;
		}
		applyForPromotion(ns, currentWork.companyName);
		return true;
	}
	if (currentWork && currentWork.type == "CRIME") {
		if (currentWork.cyclesWorked > 0) return false;
		else return true;
	}
	if (currentWork && currentWork.type == "CLASS") {
		if (ns.getHackingLevel() < studyUntilHackLevel) {
			return true;
		}
	}
	return false;
}

/** 
 * Returns factions the player should work for to gain reputation.
 * @param {NS} ns
 * @param {Player} player
 * @returns {Map<string, number>}
 **/
function getFactionsForReputation(ns, player) {
	const factionsWithAugmentations = new Map();
	for (const faction of player.factions) {
		if (faction === 'Shadows of Anarchy') continue;
		const maxReputationRequired = maxAugmentRep(ns, faction);
		if (ns.singularity.getFactionRep(faction) < maxReputationRequired) {
			factionsWithAugmentations.set(faction, maxReputationRequired - ns.singularity.getFactionRep(faction));
		}
	}
	return factionsWithAugmentations;
}

/** 
 * Returns corporations the player hasn't unlocked its faction yet.
 * @param {NS} ns
 * @param {Map} factions 
 * @returns {string[]}
 **/
function getCorpsForReputation(ns, player) {
	const corpsWithoutFaction = [];
	for (const corp of megaCorps) {
		if (!player.factions.includes(corp)) {
			corpsWithoutFaction.push(corp);
		}
	}
	//ns.print(corpsWithoutFaction);
	return corpsWithoutFaction;
}

/** 
 * Buys augmentations if enough reputation and money is available.
 * @param {NS} ns
 * @param {Player} player
 * @param {number} augmentationCostMultiplier 
 **/
export async function buyAugments(ns, augmentationCostMultiplier) {
	const LAVENDER = "\u001b[38;5;147m";
	const RED = "\u001b[31m";
	const AQUA = "\u001b[38;2;145;231;255m";
	const RESET = "\u001b[0m";
	const stockActionPort = ns.getPortHandle(5); // port 5 for sending commands to stock-trader.js
	const forceResetPort = ns.getPortHandle(6); // port 6 for manual player initiated reset trigger
	const purchasedAugmentations = ns.singularity.getOwnedAugmentations(true);

	let player = ns.getPlayer()
	let playerFactions = player.factions;
	let forceReset = false;
	let augmentationsToBuy = [];
	let goalAugmentation = "";
	let goalAugmentationFaction = "";
	let maxRepRequired = 0;

	const hasPrereqs = (purchasedAugmentations, augmentationPrereqs) => {
		return augmentationPrereqs.every(prereq => purchasedAugmentations.includes(prereq));
	}

	// Set goal as the highest rep augment among joined factions.
	let allAugmentations = [];

	for (const faction of playerFactions) {

		if (faction == 'Shadows of Anarchy') continue;
		const augmentations = ns.singularity.getAugmentationsFromFaction(faction).filter(augment => !ignoreFactionAugs?.get(faction)?.includes(augment));

		for (const augment of augmentations) {

			if (!purchasedAugmentations.includes(augment) && hasPrereqs(purchasedAugmentations, ns.singularity.getAugmentationPrereq(augment))) {
				const repReq = ns.singularity.getAugmentationRepReq(augment);

				if (repReq > maxRepRequired) {
					// Determine the highest rep requirement
					maxRepRequired = repReq;
					goalAugmentation = augment;
					goalAugmentationFaction = faction;
				}
				allAugmentations.push([augment, faction, repReq]);
			}
		}
	}

	allAugmentations.sort((a, b) => b[2] - a[2]);

	for (const [augment, faction, repReq] of allAugmentations) {
		if (ns.singularity.getFactionRep(faction) >= repReq) {
			// If current rep is enough, push the augment to augmentsToBuy
			let price = ns.singularity.getAugmentationPrice(augment);
			augmentationsToBuy.push([augment, faction, price]);
		}
	}

	augmentationsToBuy.sort((a, b) => b[2] - a[2]);

	// Remove duplicates
	const uniqueAugmentationsMap = new Map();
	for (const [augment, faction, price] of augmentationsToBuy) {
		if (!uniqueAugmentationsMap.has(augment)) {
			uniqueAugmentationsMap.set(augment, { faction, price });
		}
	}

	// Convert the Map back to an array
	augmentationsToBuy = Array.from(uniqueAugmentationsMap.entries()).map(([augment, { faction, price }]) => [augment, faction, price]);

	// Calculate the total cost of augmentations to buy including the cost mult
	let totalCost = 0;
	for (const augment of augmentationsToBuy) {
		if (augment[0] === goalAugmentation) {
			augmentationCostMultiplier = 1;
		}
		totalCost += augment[2] * augmentationCostMultiplier;
		augmentationCostMultiplier *= 1.9; // Apply multiplier for the next augmentation
	}

	ns.print(`Augmentation purchase order:`);

	let goalPrice = 0;
	if (augmentationNameEnumMembers.includes(goalAugmentation)) {
		goalPrice = ns.singularity.getAugmentationPrice(goalAugmentation);
		ns.print(`${AQUA}Goal Augmentation ${goalAugmentation}: ${ns.formatNumber(goalPrice)}`)
	}

	for (let augment of augmentationsToBuy) {
		if (augment[0] == goalAugmentation) continue;
		ns.print(`${LAVENDER}${augment[0]}: ${RESET}${ns.formatNumber(augment[2])}`);
	}
	ns.print(`${RED}Current augmentation purchase cost: ${ns.formatNumber(totalCost) + RESET}\n`);

	if (augmentationNameEnumMembers.includes(goalAugmentation) && factionEnumMembers.includes(goalAugmentationFaction)) {
		const repNow = ns.singularity.getFactionRep(goalAugmentationFaction);
		const goalAugRep = ns.singularity.getAugmentationRepReq(goalAugmentation);
		const hasEnoughFavor = ns.singularity.getFactionFavor(goalAugmentationFaction) >= ns.getFavorToDonate();
		const notEnoughRepForGoal = repNow < goalAugRep;
		if (notEnoughRepForGoal && !hasEnoughFavor) {
			var isFasterToReset = favorReset(ns, goalAugRep);
		}

		if (notEnoughRepForGoal && hasEnoughFavor) {
			const moneyNeeded = getMoneyForReputation(ns, goalAugmentationFaction, goalAugRep, repNow);

			if (moneyNeeded > 0) {
				ns.print(`Donation Goal: ${ns.formatNumber(moneyNeeded)}`);
				if (await requestFunds(ns, moneyNeeded)) {
					const donationSuccess = ns.singularity.donateToFaction(goalAugmentationFaction, moneyNeeded);
					if (donationSuccess) {
						ns.print(`SUCCESS Donated ${ns.formatNumber(moneyNeeded)} to ${goalAugmentationFaction}`);
						ns.toast(`Donated ${ns.formatNumber(moneyNeeded)} to ${goalAugmentationFaction}`, "success", 5000);
					} else {
						ns.print(`ERROR Could not donate to ${goalAugmentationFaction}!`);
						ns.toast(`Could not donate to ${goalAugmentationFaction}!`, "error", 5000);
					}
					stockActionPort.write(JSON.stringify(['ACK', donationSuccess]));
				}
			}
		}
	}

	await completeFlight(ns);
	// is goal augmentation's requirements fulfilled?
	const goalAugmentationMet = augmentationsToBuy?.some(aug => aug[0] === goalAugmentation);
	let fluxRep = ns.singularity.getAugmentationRepReq("NeuroFlux Governor");
	let fluxCost = ns.singularity.getAugmentationPrice("NeuroFlux Governor");
	player = ns.getPlayer();
	playerFactions = player.factions;
	const fluxFaction = playerFactions.length > 0 ? playerFactions.find(faction => ns.singularity.getAugmentationsFromFaction(faction).includes("NeuroFlux Governor") && ns.singularity.getFactionRep(faction) >= fluxRep) : undefined;
	
	// check if player wants to force reset
	if (forceResetPort.read() === "RESET") {
		forceReset = await ns.prompt(`Manual reset triggered: Are you sure?`, { type: "boolean", choices: ["Yes", "No"] });
	}

	// Final part, buys and installs augments
	if (((goalAugmentationMet || isFasterToReset) && await requestFunds(ns, totalCost, 1)) || forceReset) {
		stockActionPort.write(JSON.stringify(['ACK', true]));

		if (augmentationsToBuy.length <= 0 && (forceReset || isFasterToReset) && !fluxFaction) return;

		if (!await liquidateStocks(ns)) return; // something went wrong

		if (isFasterToReset) ns.toast(`Resetting to speed up rep gain`, `info`, 5000);

		for (const [augment, faction, cost] of augmentationsToBuy) {
			if (ns.singularity.purchaseAugmentation(faction, augment)) {
				ns.print(`SUCCESS Purchased augmentation ${augment}`);
				ns.toast(`Purchased augmentation ${augment}`, "success", 5000);
			} else {
				ns.print(`ERROR Could not purchase augmentation ${augment}!`);
				ns.toast(`Could not purchase augmentation ${augment}!`, "error", 5000);
			}
		}

		// spend rest of the money on flux
		while (ns.getPlayer().money > fluxCost && fluxFaction) {
			const successful = ns.singularity.purchaseAugmentation(fluxFaction, "NeuroFlux Governor");
			fluxCost = ns.singularity.getAugmentationPrice("NeuroFlux Governor");
			if (successful) {
				ns.print(`SUCCESS Purchased NeuroFlux Governor from ${fluxFaction}`);
			} else {
				ns.print(`ERROR Could not purchase NeuroFlux Governor from ${fluxFaction}!`);
				break;
			}
		}

		ns.singularity.installAugmentations("start.js");
	}
}

/** @param {NS} ns **/
function getMoneyForReputation(ns, faction, requiredRep, repNow) {
	if (!ns.fileExists("Formulas.exe", "home")) return -1;
	if (!factionEnumMembers.includes(faction)) return -1;
	const player = ns.getPlayer();
	let moneyNeeded = 1e7;
	let repAfter = ns.formulas.reputation.repFromDonation(moneyNeeded, player) + repNow;
	while (requiredRep > repAfter) {
		moneyNeeded *= 1.5;
		repAfter = ns.formulas.reputation.repFromDonation(moneyNeeded, player) + repNow;
	}
	return moneyNeeded;
};

/** @param {NS} ns **/
async function completeFlight(ns) {
	const stockActionPort = ns.getPortHandle(5);
	const player = ns.getPlayer();
	const hackLevel = player.skills.hacking;
	const factions = player.factions;
	const augments = ns.singularity.getOwnedAugmentations(false);
	const hasRedPill = augments.some(aug => aug == "The Red Pill");
	if (augments.length >= 30 && hackLevel >= 2500 && !hasRedPill && !factions.includes("Daedalus")) {
		ns.print(hasRedPill)
		if (await requestFunds(ns, 100e9, 1.0)) {
			await ns.sleep(3000);
			joinFactions(ns, ns.getPlayer())
			stockActionPort.write(JSON.stringify(['ACK', true]));
		}
	}
}

/** 
 * Commits a crime and returns the time taken.
 * @param {NS} ns
 * @param {Player} player
 * @returns {number}
 **/
function commitCrime(ns, player, combatStatsGoal = 300) {
	const focus = ns.singularity.isFocused();

	// Calculate the risk value of all crimes
	ns.print("Karma: " + ns.heart.break());
	ns.print("Kills: " + player.numPeopleKilled);

	let bestCrime = "";
	let bestCrimeValue = 0;
	let bestCrimeStats = {};
	for (let crime of crimes) {
		let crimeChance = ns.singularity.getCrimeChance(crime);
		let crimeStats = ns.singularity.getCrimeStats(crime);
		if (crime == "Assassination" && player.numPeopleKilled < 30 && crimeChance > 0.98) {
			bestCrime = "Assassination";
			bestCrimeStats = crimeStats;
			break;
		}
		else if (crime == "Homicide" && player.numPeopleKilled < 30 && crimeChance > 0.98) {
			bestCrime = "Homicide";
			bestCrimeStats = crimeStats;
			break;
		}
		var crimeValue = 0;
		if (player.skills.strength < combatStatsGoal) {
			crimeValue += 100000 * crimeStats.strength_exp;
		}
		if (player.skills.defense < combatStatsGoal) {
			crimeValue += 100000 * crimeStats.defense_exp;
		}
		if (player.skills.dexterity < combatStatsGoal) {
			crimeValue += 100000 * crimeStats.dexterity_exp;
		}
		if (player.skills.agility < combatStatsGoal) {
			crimeValue += 100000 * crimeStats.agility_exp;
		}
		crimeValue += crimeStats.money;
		//ns.print(ns.nFormat(crimeChance,"0.00a")+"/"+ns.nFormat(crimeStats.time,"000a")+"|"+crimeStats.strength_exp + "|" + crimeStats.defense_exp + "|" + crimeStats.dexterity_exp + "|" + crimeStats.agility_exp + "|" + ns.nFormat(crimeStats.money,"0a")+"|"+crime);
		crimeValue = crimeValue * crimeChance / (crimeStats.time + 10);
		if (crimeValue > bestCrimeValue) {
			bestCrime = crime;
			bestCrimeValue = crimeValue;
			bestCrimeStats = crimeStats;
		}
	}

	ns.singularity.commitCrime(bestCrime, focus);

	ns.print("Crime value " + ns.formatNumber(bestCrimeValue, 0) + " for " + bestCrime);
	return bestCrimeStats.time + 10;
}

/** 
 * Joins factions that the player is eligible for.
 * @param {NS} ns 
 **/
async function joinFactions(ns) {
	const stockActionPort = ns.getPortHandle(5);
	const scriptToRun = "travelToFaction.js";
	const joinableCityFactions = new Set();

	let player = ns.getPlayer();
	let factions = player.factions;
	let invitations = ns.singularity.checkFactionInvitations();

	// Iterate over city factions and determine joinable factions
	for (const cityFaction of cityFactions) {
		if (!factions.includes(cityFaction.name) && !invitations.includes(cityFaction.name)) {
			const augments = ns.singularity.getAugmentationsFromFaction(cityFaction.name);
			const unpurchasedAugments = augments.filter(aug => !ns.singularity.getOwnedAugmentations(false).includes(aug) && aug !== "NeuroFlux Governor");
			if (unpurchasedAugments.length > 0) {
				let isEnemy = false;
				for (const enemy of cityFaction.enemies) {
					if (factions.includes(enemy) || invitations.includes(enemy) || joinableCityFactions.has(enemy)) {
						isEnemy = true;
						break;
					}
				}
				if (!isEnemy) {
					joinableCityFactions.add(cityFaction.name);
				}
			}
		}
	}

	// Join factions from invitations
	for (const faction of invitations) {
		const ownedAugments = ns.singularity.getOwnedAugmentations(true);
		const augments = ns.singularity.getAugmentationsFromFaction(faction).filter(aug => !ownedAugments.includes(aug) && aug != "NeuroFlux Governor");
		if (augments.length == 0) continue;
		ns.singularity.joinFaction(faction);
	}

	for (const cityFactionName of joinableCityFactions) {
		const cityFaction = cityFactions.find(cf => cf.name === cityFactionName);
		var running = ns.isRunning(scriptToRun, "home", cityFaction.name);
		if (running) break;
	}

	// Join city factions if requirements are met
	for (const cityFactionName of joinableCityFactions) {
		const cityFaction = cityFactions.find(cf => cf.name === cityFactionName);
		if (await requestFunds(ns, cityFaction.moneyReq + 2e5)) {
			const homeMaxRam = ns.getServerMaxRam("home");
			const homeUsedRam = ns.getServerUsedRam("home");
			const freeRam = homeMaxRam - homeUsedRam;
			const scriptRamUsage = ns.getScriptRam(scriptToRun, "home");
			if (freeRam >= scriptRamUsage && !running) {
				const pid = ns.run(scriptToRun, 1, cityFaction.name);
				if (pid === 0) {
					stockActionPort.write(JSON.stringify(['ACK', false]));
				} else {
					// ACK packet sent by travelToFaction.js
				}
			}
		}
	}
}

/** @param {NS} ns **/
function maxAugmentRep(ns, faction) {
	const purchasedAugmentations = ns.singularity.getOwnedAugmentations(true);
	const augmentations = ns.singularity.getAugmentationsFromFaction(faction);
	const newAugmentations = augmentations.filter(val => !purchasedAugmentations.includes(val));

	if (newAugmentations.length > 0) {
		let maxReputationRequired = 0;
		for (const augmentation of newAugmentations) {
			if (ignoreFactionAugs.has(faction) && ignoreFactionAugs.get(faction) === augmentation) {
				continue;
			}
			maxReputationRequired = Math.max(maxReputationRequired, ns.singularity.getAugmentationRepReq(augmentation));
		}
		return maxReputationRequired;
	}
	return 0;
}

/** 
 * Request funds from stock-trader.js
 * If true, Do not keep stock-trader waiting by sending an ['ACK', true || false] packet.
 * If false, no need to send a packet.
 * @param {NS} ns 
 * @param {Player} player
 * @param {Number} amountNeeded
 * @returns {Promise<boolean>} true if amountNeeded is fulfilled or player already has enough money,
 * false otherwise
 * */
export async function requestFunds(ns, amountNeeded, mult = 0.5) {
	const player = ns.getPlayer();
	const stockValuePort = ns.getPortHandle(4);
	const stockActionPort = ns.getPortHandle(5);
	const stockValue = stockValuePort.peek() === "NULL PORT DATA" ? 0 : stockValuePort.peek();
	if (player.money >= amountNeeded) return true;
	if (stockValue * mult < amountNeeded) return false;

	if (player.money < amountNeeded && stockValue * mult >= amountNeeded) {
		if (!stockActionPort.empty()) return false;

		stockActionPort.write(JSON.stringify(['SYN', amountNeeded]));
		await stockActionPort.nextWrite();

		const [signal, payload] = JSON.parse(stockActionPort.read());

		if (signal !== 'SYNACK') return false;

		if (payload < amountNeeded) {
			stockActionPort.write(JSON.stringify(['ACK', false]));
			return false;
		}
		return true;
	}
}

/** 
 * Liquidates all stocks.
 * If true, kills stock-trader
 * @param {NS} ns 
 * @returns {Promise<boolean>} true if successful, false otherwise
 * */
export async function liquidateStocks(ns) {
	const stockActionPort = ns.getPortHandle(5);
	if (!ns.isRunning("stock-trader.js")) return true;

	stockActionPort.clear(); // override any previous commands
	stockActionPort.write(JSON.stringify(['SYN', 'liq'])); // send signal to liquidate stocks
	await stockActionPort.nextWrite();
	const [signal, payload] = JSON.parse(stockActionPort.read());

	if (signal !== 'SYNACK') return false; // something went wrong

	if (payload < 0) {
		ns.toast(`Couldn't liquidate ${-payload} stocks. Aborting.`, "error", 5000);
		stockActionPort.write(JSON.stringify(['ACK', false]));
		return false;
	}
	if (payload === 0) {
		ns.toast(`Assuming portfolio is empty. Continuing.`, "info", 5000);
	} else {
		ns.toast(`Sold each stock for ${ns.formatNumber(payload)}`, "success", 5000);
	}
	stockActionPort.write(JSON.stringify(['ACK', true]));
	return true;
}

/**
 * Determines whether turning in all of our rep to favor for the current faction
 * will be faster to reach desired reputation goal 
 * @param {NS} ns
 * @param {Number} goalRep
 * @returns {boolean} true if it'll be faster, false otherwise
 */
/** @param {NS} ns **/
function favorReset(ns, goalRep) {
	const player = ns.getPlayer();
	const currentWork = ns.singularity.getCurrentWork();
	if (!currentWork || currentWork.type !== "FACTION") return false;
	const factionName = currentWork.factionName;
	const workType = currentWork.factionWorkType;
	const hasFormulas = ns.fileExists("Formulas.exe");

	const calculateFavor = (rep) => {
		return 1 + Math.floor(Math.log((rep + 25000) / 25500) / Math.log(1.02));
	}

	const simulateWithResets = (startRep, goalRep, baseRepGain, threshold) => {
		let totalTime = 0;
		let timesReset = 0;
		let favor = 0;
		let repGain = baseRepGain;
		let rep = startRep;
		let resetReputations = [];

		while (rep < goalRep) {
			let timeRemaining = (goalRep - rep) / repGain;
			rep += repGain;
			let favorAfter = calculateFavor(rep);
			let repGainAfter = baseRepGain * (1 + favorAfter / 100);
			let timeRemainingAfter = goalRep / repGainAfter;

			if (rep >= goalRep) break;

			if (timeRemainingAfter * threshold < timeRemaining) {
				resetReputations.push(rep); // Log the reputation at which we reset
				timesReset += 1;
				rep = 0;
				favor = favorAfter;
				repGain = repGainAfter;
			}

			totalTime += 1;
		}

		return { totalTime, timesReset, resetReputations };
	}

	const favor = ns.singularity.getFactionFavor(factionName);
	const rep = ns.singularity.getFactionRep(factionName);
	const repGain = hasFormulas ? ns.formulas.work.factionGains(player, workType, favor).reputation * 5 : 1.515;

	if (favor >= ns.getFavorToDonate()) return false;

	let minTimeWithResets = Infinity;
	let bestThreshold = 1.0;
	let minTimesReset = 1;
	let bestResetReputations = [];

	// Simulate with resets
	for (let i = 100; i <= 150; i++) {
		let threshold = i / 100;
		let { totalTime: timeWithResets, timesReset, resetReputations } = simulateWithResets(rep, goalRep, repGain, threshold);

		// Update the minimum time and best threshold if a better time is found
		if (timeWithResets < minTimeWithResets) {
			minTimeWithResets = timeWithResets;
			bestThreshold = threshold;
			minTimesReset = timesReset;
			bestResetReputations = resetReputations;
		}
	}

	ns.print(`Optimal threshold: ${bestThreshold}`);
	ns.print(`Minimum time with resets: ${(minTimeWithResets / 60).toFixed(2)} minutes`);
	ns.print(`Times reset: ${minTimesReset}`);
	ns.print(`Reset reputations: ${bestResetReputations.map(n => ns.formatNumber(n)).join(", ")}`);

	let finalTimeRemainingAfter = (goalRep - rep) / (repGain * (1 + calculateFavor(rep) / 100));

	return finalTimeRemainingAfter * bestThreshold < (goalRep - rep) / repGain;
}



const studyUntilHackLevel = 50;

const megaCorps = ["Clarke Incorporated", "Bachman & Associates", "OmniTek Incorporated", "NWO", "Fulcrum Technologies", "Blade Industries", "ECorp", "MegaCorp", "KuaiGong International", "Four Sigma"];

const cityFactions = [{
	name: "Sector-12",
	moneyReq: 15e6,
	enemies: ["Chongqing", "New Tokyo", "Ishima", "Volhaven"]
}, {
	name: "Chongqing",
	moneyReq: 20e6,
	enemies: ["Sector-12", "Aevum", "Volhaven"]
}, {
	name: "New Tokyo",
	moneyReq: 20e6,
	enemies: ["Sector-12", "Aevum", "Volhaven"]
}, {
	name: "Ishima",
	moneyReq: 30e6,
	enemies: ["Sector-12", "Aevum", "Volhaven"]
}, {
	name: "Aevum",
	moneyReq: 40e6,
	enemies: ["Chongqing", "New Tokyo", "Ishima", "Volhaven"]
}, {
	name: "Volhaven",
	moneyReq: 50e6,
	enemies: ["Chongqing", "Sector-12", "New Tokyo", "Aevum", "Ishima"]
}];

const crimes = ["Shoplift", "Rob Store", "Mug", "Larceny", "Deal Drugs", "Bond Forgery", "Traffick Arms", "Homicide", "Grand Theft Auto", "Kidnap", "Assassination", "Heist"];

const ignoreFactionAugs = new Map([
	["CyberSec", 'Cranial Signal Processors - Gen II'],
	["NiteSec", 'DataJack'],
	["The Black Hand", 'Embedded Netburner Module Core Implant'],
	["Sector-12", 'Neuralstimulator'],
]);

const factionEnumMembers = ["Illuminati", "Daedalus", "The Covenant", "ECorp", "MegaCorp", "Bachman & Associates", "Blade Industries", "NWO", "Clarke Incorporated", "OmniTek Incorporated", "Four Sigma", "KuaiGong International", "Fulcrum Secret Technologies", "BitRunners", "The Black Hand", "NiteSec", "Aevum", "Chongqing", "Ishima", "New Tokyo", "Sector-12", "Volhaven", "Speakers for the Dead", "The Dark Army", "The Syndicate", "Silhouette", "Tetrads", "Slum Snakes", "Netburners", "Tian Di Hui", "CyberSec", "Bladeburners", "Church of the Machine God", "Shadows of Anarchy"];
const augmentationNameEnumMembers = ["NeuroFlux Governor", "Augmented Targeting I", "Augmented Targeting II", "Augmented Targeting III", "Synthetic Heart", "Synfibril Muscle", "Combat Rib I", "Combat Rib II", "Combat Rib III", "Nanofiber Weave", "NEMEAN Subdermal Weave", "Wired Reflexes", "Graphene Bone Lacings", "Bionic Spine", "Graphene Bionic Spine Upgrade", "Bionic Legs", "Graphene Bionic Legs Upgrade", "Speech Processor Implant", "TITN-41 Gene-Modification Injection", "Enhanced Social Interaction Implant", "BitWire", "Artificial Bio-neural Network Implant", "Artificial Synaptic Potentiation", "Enhanced Myelin Sheathing", "Synaptic Enhancement Implant", "Neural-Retention Enhancement", "DataJack", "Embedded Netburner Module", "Embedded Netburner Module Core Implant", "Embedded Netburner Module Core V2 Upgrade", "Embedded Netburner Module Core V3 Upgrade", "Embedded Netburner Module Analyze Engine", "Embedded Netburner Module Direct Memory Access Upgrade", "Neuralstimulator", "Neural Accelerator", "Cranial Signal Processors - Gen I", "Cranial Signal Processors - Gen II", "Cranial Signal Processors - Gen III", "Cranial Signal Processors - Gen IV", "Cranial Signal Processors - Gen V", "Neuronal Densification", "Neuroreceptor Management Implant", "Nuoptimal Nootropic Injector Implant", "Speech Enhancement", "FocusWire", "PC Direct-Neural Interface", "PC Direct-Neural Interface Optimization Submodule", "PC Direct-Neural Interface NeuroNet Injector", "PCMatrix", "ADR-V1 Pheromone Gene", "ADR-V2 Pheromone Gene", "The Shadow's Simulacrum", "Hacknet Node CPU Architecture Neural-Upload", "Hacknet Node Cache Architecture Neural-Upload", "Hacknet Node NIC Architecture Neural-Upload", "Hacknet Node Kernel Direct-Neural Interface", "Hacknet Node Core Direct-Neural Interface", "Neurotrainer I", "Neurotrainer II", "Neurotrainer III", "HyperSight Corneal Implant", "LuminCloaking-V1 Skin Implant", "LuminCloaking-V2 Skin Implant", "HemoRecirculator", "SmartSonar Implant", "Power Recirculation Core", "QLink", "The Red Pill", "SPTN-97 Gene Modification", "ECorp HVMind Implant", "CordiARC Fusion Reactor", "SmartJaw", "Neotra", "Xanipher", "nextSENS Gene Modification", "OmniTek InfoLoad", "Photosynthetic Cells", "BitRunners Neurolink", "The Black Hand", "Unstable Circadian Modulator", "CRTX42-AA Gene Modification", "Neuregen Gene Modification", "CashRoot Starter Kit", "NutriGen Implant", "INFRARET Enhancement", "DermaForce Particle Barrier", "Graphene BrachiBlades Upgrade", "Graphene Bionic Arms Upgrade", "BrachiBlades", "Bionic Arms", "Social Negotiation Assistant (S.N.A)", "violet Congruity Implant", "Hydroflame Left Arm", "BigD's Big ... Brain", "Z.O.Ë.", "EsperTech Bladeburner Eyewear", "EMS-4 Recombination", "ORION-MKIV Shoulder", "Hyperion Plasma Cannon V1", "Hyperion Plasma Cannon V2", "GOLEM Serum", "Vangelis Virus", "Vangelis Virus 3.0", "I.N.T.E.R.L.I.N.K.E.D", "Blade's Runners", "BLADE-51b Tesla Armor", "BLADE-51b Tesla Armor: Power Cells Upgrade", "BLADE-51b Tesla Armor: Energy Shielding Upgrade", "BLADE-51b Tesla Armor: Unibeam Upgrade", "BLADE-51b Tesla Armor: Omnibeam Upgrade", "BLADE-51b Tesla Armor: IPU Upgrade", "The Blade's Simulacrum", "Stanek's Gift - Genesis", "Stanek's Gift - Awakening", "Stanek's Gift - Serenity", "SoA - Might of Ares", "SoA - Wisdom of Athena", "SoA - Trickery of Hermes", "SoA - Beauty of Aphrodite", "SoA - Chaos of Dionysus", "SoA - Flood of Poseidon", "SoA - Hunt of Artemis", "SoA - Knowledge of Apollo", "SoA - phyzical WKS harmonizer"];