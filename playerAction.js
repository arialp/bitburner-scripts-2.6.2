const studyUntilHackLevel = 50;
const megaCorps = ["Clarke Incorporated", "Bachman & Associates", "OmniTek Incorporated", "NWO", "Fulcrum Secret Technologies", "Blade Industries", "ECorp", "MegaCorp", "KuaiGong International", "Four Sigma"];
const cityFactions = [{
	name: "Sector-12",
	moneyReq: 15e6,
	enemies: ["Chongqing", "New Tokyo", "Ishima", "Volhaven"]
},
{
	name: "Chongqing",
	moneyReq: 20e6,
	enemies: ["Sector-12", "Aevum", "Volhaven"]
},
{
	name: "New Tokyo",
	moneyReq: 20e6,
	enemies: ["Sector-12", "Aevum", "Volhaven"]
},
{
	name: "Ishima",
	moneyReq: 30e6,
	enemies: ["Sector-12", "Aevum", "Volhaven"]
},
{
	name: "Aevum",
	moneyReq: 40e6,
	enemies: ["Chongqing", "New Tokyo", "Ishima", "Volhaven"]
},
{
	name: "Volhaven",
	moneyReq: 50e6,
	enemies: ["Chongqing", "Sector-12", "New Tokyo", "Aevum", "Ishima"]
}
];
const crimes = ["Shoplift", "Rob Store", "Mug", "Larceny", "Deal Drugs", "Bond Forgery", "Traffick Arms", "Homicide", "Grand Theft Auto", "Kidnap", "Assassination", "Heist"];
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
	ns.clearPort(5); // flush port 5 in case of stuck commands
	while (true) {
		var augmentationCostMultiplier = 1.9;
		/**  
		 * starting from 1.9 because cost calculation
		 * will act as if goalAugmentation is in augmentationsToBuy already
		 * */

		player = ns.getPlayer();
		ns.clearLog();

		let start = new Date();
		await getPrograms(ns, player);
		await joinFactions(ns, player);
		await buyAugments(ns, player, augmentationCostMultiplier);
		await upgradeHomeServer(ns, player);
		let end = new Date();
		let timeSlept = end.getTime() - start.getTime();
		const sleepTime = 5000 - timeSlept;


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
export async function upgradeHomeServer(ns, player) {
	const stockActionPort = ns.getPortHandle(5);
	const has4STIX = ns.stock.has4SDataTIXAPI();

	if (!has4STIX && player.money > 40e9) {
		ns.stock.purchase4SMarketDataTixApi();
		ns.stock.purchase4SMarketData();
	}

	const upgradeHomeRam = async () => {
		const ramUpgradeCost = ns.singularity.getUpgradeHomeRamCost();
		if (ns.getServerMaxRam("home") >= Math.pow(2, 30)) return false;
		if (await requestFunds(ns, player, ramUpgradeCost)) {
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
		if (await requestFunds(ns, player, coreUpgradeCost)) {
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
export async function getPrograms(ns, player) {
	const stockValuePort = ns.getPortHandle(4);
	const stockActionPort = ns.getPortHandle(5);
	const stockValue = stockValuePort.peek() === "NULL PORT DATA" ? 0 : stockValuePort.peek();
	const balance = player.money + stockValue;
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
		if (await requestFunds(ns, player, 1e6)) {
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
		if (await requestFunds(ns, player, programCosts[program])) {
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
	var focus = ns.singularity.isFocused();
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
	} else if (focus) {
		const crimeTime = commitCrime(ns, player);
		return crimeTime;
	} else {
		ns.toast(`Crime Time! Please focus on something to start crimes.`, `warning`);
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
			const repPerSecond = ns.fileExists("Formulas.exe", "home") ? ns.formulas.work.factionGains(player, factionWork, factionFavor).reputation * 5 : 10;
			const repTimeRemaining = repRemaining / repPerSecond;

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
export async function buyAugments(ns, player, augmentationCostMultiplier) {
	const playerFactions = player.factions;
	const stockValuePort = ns.getPortHandle(4); // port 4 for reading stock-trader.js announcement
	const stockActionPort = ns.getPortHandle(5); // port 5 for sending commands to stock-trader.js
	const manualResetPort = ns.getPortHandle(6); // port 6 for manual player initiated reset trigger
	var manualReset = false;
	const stockValue = stockValuePort.peek() === "NULL PORT DATA" ? 0 : stockValuePort.peek();
	const balance = player.money + stockValue;
	const purchasedAugmentations = ns.singularity.getOwnedAugmentations(true);
	const augmentationsToBuy = [];
	const LAVENDER = "\u001b[38;5;147m";
	const RED = "\u001b[31m";
	const AQUA = "\u001b[38;2;145;231;255m";
	const RESET = "\u001b[0m";

	let goalAugmentation = "";
	let goalAugmentationFaction = "";
	let maxRepRequired = 0;

	const hasPrereqs = (purchasedAugmentations, augmentationPrereqs) => {
		return augmentationPrereqs.every(prereq => purchasedAugmentations.includes(prereq));
	}

	// Set goal as the highest rep augment among joined factions.
	let allAugmentations = [];

	for (const faction of playerFactions) {

		if (faction === 'Shadows of Anarchy') continue;

		const augmentations = ns.singularity.getAugmentationsFromFaction(faction).filter(augment => !ignoreFactionAugs.get(faction)?.includes(augment));

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

	for (const [augment, faction, rep] of allAugmentations) {
		if (ns.singularity.getFactionRep(faction) >= rep) {
			// If current rep is enough, push the augment to augmentsToBuy
			let price;
			try { // case: no augmentations
				price = ns.singularity.getAugmentationPrice(augment);
			} catch (e) {
				price = 0;
			}
			augmentationsToBuy.push([augment, faction, price]);
		}
	}

	augmentationsToBuy.sort((a, b) => b[2] - a[2]);

	// Calculate the total cost of augmentations to buy including the cost mult
	let totalCost = 0;
	for (const augment of augmentationsToBuy) {
		if (augment[0] === goalAugmentation) {
			augmentationCostMultiplier = 1;
		}
		totalCost += augment[2] * augmentationCostMultiplier;
		augmentationCostMultiplier *= 1.9; // Apply multiplier for the next augmentation
	}

	if (manualResetPort.read() === "RESET") {
		var manualReset = await ns.prompt(`Manual reset triggered: Are you sure?`, { type: "boolean", choices: ["Yes", "No"] });
	}

	// is goal augmentation's requirements fulfilled?
	const goalAugmentationMet = goalAugmentation === "" ? false : augmentationsToBuy.some(aug => aug[0] === goalAugmentation);
	const favorToDonate = ns.getFavorToDonate();

	ns.print(`Augmentation purchase order:`);

	let goalPrice;
	try { // case: no goalAugmentation
		goalPrice = ns.singularity.getAugmentationPrice(goalAugmentation);
	} catch (e) {
		goalPrice = 0;
	}
	ns.print(`${AQUA}Goal Augmentation : ${goalAugmentation} : ${ns.formatNumber(goalPrice)}`)
	ns.print(`${LAVENDER}/__________________Cart__________________\\`);

	for (let augment of augmentationsToBuy) {
		if (augment[0] === goalAugmentation) continue;
		ns.print(`${LAVENDER}${augment[0]} : ${RESET}${ns.formatNumber(augment[2])}`);
	}
	ns.print(`${RED}Current augmentation purchase cost : ` + ns.formatNumber(totalCost) + RESET);
	ns.print('\n');

	const hasEnoughFavor = (data) => {
		let faction;
		if (typeof data === "object") {
			faction = data.find(aug => aug[0] === goalAugmentation)?.[1];
		} else if (typeof data === "string") {
			if (data === "") return false;
			faction = data;
		};
		return (
			faction
				? (ns.singularity.getFactionFavor(faction) + ns.singularity.getFactionFavorGain(faction)) >= favorToDonate
				: false
		);
	}
	const getMoneyForReputation = (faction, requiredRep) => {
		if (ns.fileExists("Formulas.exe", "home")) {
			if (faction === "") return;
			let repNow = ns.singularity.getFactionRep(faction);
			let moneyNeeded = 1e7;
			let repAfter = ns.formulas.reputation.repFromDonation(moneyNeeded, player) + repNow;
			while (requiredRep > repAfter) {
				moneyNeeded *= 1.5;
				repAfter = ns.formulas.reputation.repFromDonation(moneyNeeded, player) + repNow;
			}
			//ns.print(repAfter)
			return moneyNeeded;
		} else {
			// Player doesn't have formulas, return a large enough value to ensure it doesn't crash
			ns.print(`WARN Formulas.exe not found! Cannot calculate donation goal.`);
			return balance + 1e9;
		}
	};

	if (goalAugmentation !== "") {
		if (ns.singularity.getFactionRep(goalAugmentationFaction) < ns.singularity.getAugmentationRepReq(goalAugmentation) && hasEnoughFavor(goalAugmentationFaction)) {
			const requiredRep = ns.singularity.getAugmentationRepReq(goalAugmentation);
			const moneyNeeded = getMoneyForReputation(goalAugmentationFaction, requiredRep);
			ns.print(`Donation Goal: ${ns.formatNumber(moneyNeeded)}`);

			if (await requestFunds(ns, player, moneyNeeded)) {
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

	if ((goalAugmentationMet && balance * 0.9 > totalCost) || manualReset) {
		if (augmentationsToBuy.length <= 0) return; //failsafe: this should not run but just in case

		if (!await liquidateStocks(ns)) return; // something went wrong

		stockActionPort.write(JSON.stringify(['ACK', true]));

		for (const [augment, faction, cost] of augmentationsToBuy) {
			if (ns.singularity.purchaseAugmentation(faction, augment)) {
				ns.print(`SUCCESS Purchased augmentation ${augment}`);
				ns.toast(`Purchased augmentation ${augment}`, "success", 5000);
			} else {
				ns.print(`ERROR Could not purchase augmentation ${augment}!`);
				ns.toast(`Could not purchase augmentation ${augment}!`, "error", 5000);
			}
		}

		while (true) {
			const [neurofluxFaction] = playerFactions.length > 0 ? playerFactions.filter(faction => ns.singularity.getAugmentationsFromFaction(faction).includes("NeuroFlux Governor")) : [undefined];
			const cost = ns.singularity.getAugmentationPrice("NeuroFlux Governor");
			if (balance > cost && neurofluxFaction) {
				var successful = ns.singularity.purchaseAugmentation(neurofluxFaction, "NeuroFlux Governor");
				if (successful) {
					ns.print(`SUCCESS Purchased NeuroFlux Governor from ${neurofluxFaction}`);
				} else {
					ns.print(`ERROR Could not purchase NeuroFlux Governor from ${neurofluxFaction}!`);
					break;
				}
			} else {
				break;
			}
			await ns.sleep(100);
		}

		ns.singularity.installAugmentations("start.js");
	}
}

/** 
 * Commits a crime and returns the time taken.
 * @param {NS} ns
 * @param {Player} player
 * @returns {number}
 **/
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

/** 
 * Joins factions that the player is eligible for.
 * @param {NS} ns 
 **/
async function joinFactions(ns, player) {
	const stockActionPort = ns.getPortHandle(5);
	const scriptToRun = "travelToFaction.js";
	const factions = player.factions;
	const invitations = ns.singularity.checkFactionInvitations();
	const joinableCityFactions = new Set();

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
		if (await requestFunds(ns, player, cityFaction.moneyReq)){
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
export async function requestFunds(ns, player, amountNeeded) {
	const stockValuePort = ns.getPortHandle(4);
	const stockActionPort = ns.getPortHandle(5);
	const stockValue = stockValuePort.peek() === "NULL PORT DATA" ? 0 : stockValuePort.peek();

	if (stockValue * 0.5 < amountNeeded) return false;
	if (player.money >= amountNeeded) return true;

	if (player.money < amountNeeded && stockValue * 0.5 >= amountNeeded) {
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
 * If true, Do not keep stock-trader waiting by sending an ['ACK', true || false] packet.
 * If false, no need to send a packet.
 * @param {NS} ns 
 * @returns {Promise<boolean>} true if successful, false otherwise
 * */
export async function liquidateStocks(ns) {
	const stockActionPort = ns.getPortHandle(5);
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
	return true;
}
