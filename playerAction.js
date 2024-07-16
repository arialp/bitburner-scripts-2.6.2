const studyUntilHackLevel = 50;
const maxAugmentCostMultiplier = 1.9;
const megaCorps = ["Clarke Incorporated", "Bachman & Associates", "OmniTek Incorporated", "NWO", "Fulcrum Secret Technologies", "Blade Industries", "ECorp", "MegaCorp", "KuaiGong International", "Four Sigma"];
const cityFactions = ["Sector-12", "Chongqing", "New Tokyo", "Ishima", "Aevum", "Volhaven"];
const crimes = ["Shoplift", "RobStore", "Mug", "Larceny", "Deal Drugs", "Bond Forgery", "Traffick Arms", "Homicide", "Grand Theft Auto", "Kidnap", "Assassination", "Heist"];
const ignoreFactionAugs = new Map([
	["CyberSec", 'Cranial Signal Processors - Gen II'],
	["NiteSec", 'DataJack'],
	["The Black Hand", 'Embedded Netburner Module Core Implant'],
	["Sector-12", 'Neuralstimulator'],
]);

/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");
	var player = ns.getPlayer();
	var augmentationCostMultiplier = 1;

	while (true) {
		ns.print("");

		let sleepTime = 5000;
		player = ns.getPlayer();

		ns.print("\n");

		getPrograms(ns, player);
		joinFactions(ns);
		buyAugments(ns, player, augmentationCostMultiplier);
		upgradeHomeServer(ns, player);

		const factionsForReputation = getFactionsForReputation(ns, player);
		ns.print("Factions for Reputation: " + [...factionsForReputation.keys()]);

		const actionUseful = currentActionUseful(ns, player, factionsForReputation);
		ns.print("Current action useful: " + actionUseful);

		if (!actionUseful) {
			sleepTime = chooseAction(ns, sleepTime, player, factionsForReputation);
		}

		await ns.sleep(sleepTime);
	}
}

function upgradeHomeServer(ns, player) {
	if (!ns.stock.has4SDataTIXAPI() && player.money > 30e9) {
		ns.stock.purchase4SMarketDataTixApi();
		ns.stock.purchase4SMarketData();
	}
	if (player.money > ns.singularity.getUpgradeHomeRamCost()) {
		if (ns.singularity.getUpgradeHomeRamCost() < 2e9
			|| (ns.stock.has4SDataTIXAPI() && ns.singularity.getUpgradeHomeRamCost() < 0.2 * player.money)) {
			ns.print("Upgraded Home Server RAM");
			ns.toast("Upgraded Home Server RAM");
			ns.singularity.upgradeHomeRam();
		}
	}
}

function getPrograms(ns, player) {
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
		if (player.money > 1700000) {
			ns.singularity.purchaseTor();
			ns.print("Purchased TOR");
			ns.toast("Purchased TOR");
		} else {
			return;
		}
	}
	const programs = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "ServerProfiler.exe", "DeepscanV1.exe", "DeepscanV2.exe", "AutoLink.exe", "Formulas.exe"];
	if (ns.stock.has4SDataTIXAPI()) {
		programs.push("HTTPWorm.exe", "SQLInject.exe");
	}
	for (const program of programs) {
		if (!ns.fileExists(program) && player.money > programCosts[program]) {
			ns.singularity.purchaseProgram(program);
			ns.print("Purchased program: " + program);
			ns.toast("Purchased program: " + program);
		}
	}
}

function chooseAction(ns, sleepTime, player, factions) {
	var focus = ns.singularity.isFocused();
	if (ns.getHackingLevel() < studyUntilHackLevel) {
		ns.singularity.universityCourse("rothman university", "Study Computer Science", focus);
	} else if (factions.size > 0) {
		const faction = factions.keys().next().value;
		const factionsFieldWork = ["Slum Snakes", "Tetrads"];
		const workType = factionsFieldWork.includes(faction) ? "field" : "hacking";
		const success = ns.singularity.workForFaction(faction, workType, focus);
		if (success) {
			ns.print("Start working for faction " + faction);
			ns.toast("Start working for faction " + faction, "success", 5000);
		} else {
			ns.print("Could not perform intended action: " + faction + " -> " + workType);
		}
	} else if (player.skills.hacking >= 250) {
		const corpsToWorkFor = getCorpsForReputation(ns, factions);
		if (corpsToWorkFor.length > 0) {
			applyForPromotion(ns, player, corpsToWorkFor[0]);
			ns.print("Start working for " + corpsToWorkFor[0]);
			ns.toast("Start working for " + corpsToWorkFor[0]);
		}
	} else if (focus) {
		const crimeTime = commitCrime(ns, player);
		return crimeTime;
	} else {
		ns.toast("Crime Time! Please focus on something to start crimes.", "warning");
	}
	return sleepTime;
}

function applyForPromotion(ns, player, corp) {
	const career = "IT";
	const success = ns.singularity.applyToCompany(corp, career);
	if (success) {
		ns.toast("Got a company promotion!");
	}
	ns.singularity.workForCompany(corp, ns.singularity.isFocused());
}

function currentActionUseful(ns, player, factions) {
	const playerControlPort = ns.getPortHandle(3);
	const currentWork = ns.singularity.getCurrentWork();
	if (currentWork && currentWork.type == "FACTION") {
		const faction = currentWork.factionName;
		if (factions.has(faction)) {
			const factionWork = currentWork.factionWorkType;
			const factionFavor = ns.singularity.getFactionFavor(faction);
			const repRemaining = factions.get(faction);
			const repPerSecond = ns.formulas.work.factionGains(player, factionWork, factionFavor).reputation * 5;
			const repTimeRemaining = repRemaining / repPerSecond;

			if (repRemaining > 0) {
				if (playerControlPort.empty() && factionWork == "hacking") {
					ns.print("ns.share() to increase faction reputation");
					playerControlPort.write(true);
				} else if (playerControlPort.empty()) {
					playerControlPort.write(false);
				}
				ns.print("Reputation remaining: " + ns.formatNumber(repRemaining, 3) + " in " + ns.formatNumber(repTimeRemaining / 60, 0) + " min");
				return true;
			} else {
				ns.print("Max Reputation @ " + faction);
				ns.toast("Max Reputation @ " + faction, "success", 5000);
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
	if (currentWork && currentWork.type == "COMPANY" && Object.keys(player.jobs)[0] != "") {
		const reputationGoal = 200000;
		const reputation = ns.singularity.getCompanyRep(Object.keys(player.jobs)[0]);
		ns.print("Company reputation: " + ns.formatNumber(reputation, 0));
		if (factions.has(Object.keys(player.jobs)[0])) {
			return false;
		}
		applyForPromotion(ns, player, Object.keys(player.jobs)[0]);
		return true;
	}
	if (currentWork && currentWork.type == "CLASS") {
		if (ns.getHackingLevel() < studyUntilHackLevel) {
			return true;
		}
	}
	return false;
}

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

function getCorpsForReputation(ns, factions) {
	const corpsWithoutFaction = [];
	for (const corp of megaCorps) {
		if (!factions.has(corp)) {
			corpsWithoutFaction.push(corp);
		}
	}
	return corpsWithoutFaction;
}

async function buyAugments(ns, player, augmentationCostMultiplier) {
	const playerFactions = player.factions;
	const goalAugmentation = "The Red Pill"; // or whichever is your goal augmentation
	const purchasedAugmentations = ns.singularity.getOwnedAugmentations(true);
	const augmentationsToBuy = [];
	const LAVENDER = "\u001b[38;5;147m";
	const RED = "\u001b[31m";
	const RESET = "\u001b[0m";

	let allAugmentations = [];
	for (const faction of playerFactions) {
		const augmentations = ns.singularity.getAugmentationsFromFaction(faction).filter(augment => !ignoreFactionAugs.get(faction)?.includes(augment));
		//ns.print(augmentations);
		for (const augment of augmentations) {
			if (!purchasedAugmentations.includes(augment) && hasPrereqs(purchasedAugmentations, ns.singularity.getAugmentationPrereq(augment))) {
				allAugmentations.push([augment, faction]);
			}
		}
	}
	//ns.print(allAugmentations);
	allAugmentations.sort((a, b) => ns.singularity.getAugmentationPrice(a[0])[0] - ns.singularity.getAugmentationPrice(b[0])[0]);

	for (const [augment, faction] of allAugmentations) {
		const [cost, rep] = ns.singularity.getAugmentationPrereq(augment);
		if (ns.singularity.getFactionRep(faction) >= rep) {
			augmentationsToBuy.push([augment, faction, cost]);
		}
	}

	const goalAugmentationMet = augmentationsToBuy.some(aug => aug[0] === goalAugmentation);
	const totalCost = augmentationsToBuy.reduce((sum, aug) => sum + aug[2] * augmentationCostMultiplier, 0);

	ns.print(`Augmentation purchase order:`);
	for (let augment of augmentationsToBuy) {
		ns.print(`${LAVENDER}${augment[0]} : ${RESET}${ns.formatNumber(augment[2] * augmentationCostMultiplier)}`);
	}
	ns.print(`${RED}Current augmentation purchase cost : ` + ns.formatNumber(totalCost) + RESET);
	ns.print('\n');

	if (goalAugmentationMet && player.money > totalCost) {
		for (const [augment, faction] of augmentationsToBuy) {
			ns.singularity.purchaseAugmentation(faction, augment);
			augmentationCostMultiplier *= maxAugmentCostMultiplier;
			ns.print("Purchased augmentation: " + augment);
			ns.toast("Purchased augmentation: " + augment, "success");
		}

		ns.scriptKill("stock-trader.js", "home");
		ns.run("sell-stocks.js");
		ns.print(`SUCCESS Liquidating stocks.`);
		ns.toast(`Liquidating stocks.`, "success", 5000);

		while (true) {
			const [neurofluxFaction] = playerFactions.filter(faction => ns.singularity.getAugmentationsFromFaction(faction).includes("NeuroFlux Governor"));
			const [cost] = ns.singularity.getAugmentationPrice("NeuroFlux Governor");
			if (player.money > cost) {
				ns.singularity.purchaseAugmentation(neurofluxFaction, "NeuroFlux Governor");
				ns.print("Purchased NeuroFlux Governor from " + neurofluxFaction);
				ns.toast("Purchased NeuroFlux Governor from " + neurofluxFaction, "success");
			} else {
				break;
			}
			await ns.sleep(500);
		}

		//"start.js" should be your init script
		ns.singularity.installAugmentations("start.js");
	} else if (!goalAugmentationMet && totalCost > player.money * 10) {
		ns.print("Cannot afford all augmentations, will reset");
		ns.singularity.installAugmentations("start.js");
	}
}


function hasPrereqs(purchasedAugmentations, augmentationPrereqs) {
	return augmentationPrereqs.every(prereq => purchasedAugmentations.includes(prereq));
}

function commitCrime(ns, player, combatStatsGoal = 300) {
	// Calculate the risk value of all crimes

	ns.print("Karma: " + ns.heart.break());
	ns.print("Kills: " + player.numPeopleKilled);

	var bestCrime = "";
	var bestCrimeValue = 0;
	var bestCrimeStats = {};
	for (let crime of crimes) {
		let crimeChance = ns.singularity.getCrimeChance(crime);
		var crimeStats = ns.singularity.getCrimeStats(crime);
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

	ns.singularity.commitCrime(bestCrime);

	ns.print("Crime value " + ns.formatNumber(bestCrimeValue, 0) + " for " + bestCrime);
	return bestCrimeStats.time + 10;
}

function joinFactions(ns) {
	const newFactions = ns.singularity.checkFactionInvitations();
	for (const faction of newFactions) {
		if (!cityFactions.includes(faction) && maxAugmentRep(ns, faction)) {
			ns.singularity.joinFaction(faction);
			ns.print("Joined " + faction);
		}
	}
}

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
