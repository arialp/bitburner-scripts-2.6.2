// file: stock-trader.js

// requires 4s Market Data TIX API Access

// defines if stocks can be shorted (see BitNode 8)
const shortAvailable = true;
const commission = 100000;

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog("ALL");
	const msPerStockUpdate = ns.stock.getConstants().msPerStockUpdate;
	const msPerStockUpdateMin = ns.stock.getConstants().msPerStockUpdateMin;

	while (true) {
		const bonusTime = ns.stock.getBonusTime();
		const sleepTime = bonusTime > 0 ? msPerStockUpdateMin : msPerStockUpdate;
		let start = new Date();
		await tendStocks(ns);
		let end = new Date();
		let timeSlept = end.getTime() - start.getTime();
		await ns.sleep(sleepTime - timeSlept);
		timeSlept = 0;
	}
}

/** @param {NS} ns */
async function tendStocks(ns) {
	ns.print("");
	const stocks = getAllStocks(ns);

	stocks.sort((a, b) => b.profitPotential - a.profitPotential);

	var longStocks = new Set();
	var shortStocks = new Set();
	var overallValue = 0;

	for (const stock of stocks) {
		if (stock.longShares > 0) {
			if (stock.forecast > 0.5) {
				longStocks.add(stock.sym);
				ns.print(`INFO ${stock.summary} LONG \$${ns.formatNumber(stock.cost + stock.profit)} ${ns.formatPercent(stock.profit / stock.cost)}`);
				overallValue += (stock.cost + stock.profit);
			}
			else {
				const salePrice = ns.stock.sellStock(stock.sym, stock.longShares);
				const saleTotal = salePrice * stock.longShares;
				const saleCost = stock.longPrice * stock.longShares;
				const saleProfit = saleTotal - saleCost - 2 * commission;
				stock.shares = 0;
				shortStocks.add(stock.sym);
				ns.print(`WARN ${stock.summary} SOLD for \$${ns.formatNumber(saleProfit)} profit`);
			}
		}
		if (stock.shortShares > 0) {
			if (stock.forecast < 0.5) {
				shortStocks.add(stock.sym);
				ns.print(`INFO ${stock.summary} SHORT \$${ns.formatNumber(stock.cost + stock.profit)} ${ns.formatPercent(stock.profit / stock.cost)}`);
				overallValue += (stock.cost + stock.profit);
			}
			else {
				const salePrice = ns.stock.sellShort(stock.sym, stock.shortShares);
				const saleTotal = salePrice * stock.shortShares;
				const saleCost = stock.shortPrice * stock.shortShares;
				const saleProfit = saleTotal - saleCost - 2 * commission;
				stock.shares = 0;
				longStocks.add(stock.sym);
				ns.print(`WARN ${stock.summary} SHORT SOLD for \$${ns.formatNumber(-saleProfit)} profit`);
			}
		}
	}

	for (const stock of stocks) {
		var money = ns.getServerMoneyAvailable("home");
		//ns.print(`INFO ${stock.summary}`);
		if (stock.forecast > 0.55) {
			longStocks.add(stock.sym);
			//ns.print(`INFO ${stock.summary}`);
			if (money > 500 * commission) {
				const sharesToBuy = Math.min(stock.maxShares, Math.floor((money - commission) / stock.askPrice));
				if (ns.stock.buyStock(stock.sym, sharesToBuy) > 0) {
					ns.print(`WARN ${stock.summary} LONG BOUGHT \$${ns.formatNumber(sharesToBuy)}`);
				}
			}
		}
		else if (stock.forecast < 0.45 && shortAvailable) {
			shortStocks.add(stock.sym);
			//ns.print(`INFO ${stock.summary}`);
			if (money > 500 * commission) {
				const sharesToBuy = Math.min(stock.maxShares, Math.floor((money - commission) / stock.bidPrice));
				if (ns.stock.buyShort(stock.sym, sharesToBuy) > 0) {
					//ns.print(`WARN ${stock.summary} SHORT BOUGHT ${ns.nFormat(sharesToBuy, "$0.0a")}`);
					ns.print(`WARN ${stock.summary} SHORT BOUGHT \$${ns.formatNumber(sharesToBuy)}`);
				}
			}
		}
	}
	ns.print("Portfolio value: $" + ns.formatNumber(overallValue));

	// send stock market manipulation orders to hack manager
	var growStockPort = ns.getPortHandle(1); // port 1 is grow
	var hackStockPort = ns.getPortHandle(2); // port 2 is hack
	if (growStockPort.empty() && hackStockPort.empty()) {
		// only write to ports if empty
		for (const sym of longStocks) {
			//ns.print("INFO grow " + sym);
			growStockPort.write(getSymServer(sym));
		}
		for (const sym of shortStocks) {
			//ns.print("INFO hack " + sym);
			hackStockPort.write(getSymServer(sym));
		}
	}

	var stockValuePort = ns.getPortHandle(4); // port 4 for announcing current portfolio value
	var stockActionPort = ns.getPortHandle(5); // port 5 for listening for commands

	if (stockValuePort.empty()) {
		stockValuePort.write(overallValue);
	} else {
		stockValuePort.clear();
		stockValuePort.write(overallValue);
	}

	if (!stockActionPort.empty()) {
		const packet = JSON.parse(stockActionPort.read());
		const [signal, payload] = packet;

		if (signal === 'SYN') {
			if (payload === 'liq') { // proceed to stop trading and liquidate
				let totalMoneyGained = 0;
				for (let stock of stocks) {
					if (stock.shortShares > 0) {
						let moneyGained = ns.stock.sellShort(stock.sym, stock.shortShares);
						totalMoneyGained += moneyGained;
						stock.shortShares = 0;
					}
					if (stock.longShares > 0) {
						let moneyGained = ns.stock.sellStock(stock.sym, stock.longShares);
						totalMoneyGained += moneyGained;
						stock.longShares = 0;
					}
				}
				//totalMoneyGained = (stocks.length > 0) ? -totalMoneyGained : totalMoneyGained;
				stockActionPort.write(JSON.stringify(["SYNACK", totalMoneyGained]));
				await stockActionPort.nextWrite();
				const [newSignal, newPayload] = JSON.parse(stockActionPort.read());
				if (newSignal === 'ACK' && newPayload) {
					ns.exit();
				}

			} else if (typeof payload === 'number') {
				const sellAmount = payload + 1;
				let totalMoney = 0;

				for (let i = stocks.length - 1; i >= 0; i--) {
					let stock = stocks[i];
					if (totalMoney >= sellAmount) break;

					if (stock.shortShares > 0) {
						let sharesToSell = Math.min(stock.shortShares, Math.floor((sellAmount + commission - totalMoney) / stock.bidPrice));
						let salePrice = ns.stock.sellShort(stock.sym, sharesToSell);
						let saleTotal = salePrice * sharesToSell - commission;
						totalMoney += saleTotal;
						stock.shortShares -= sharesToSell;
					} else if (stock.longShares > 0) {
						let sharesToSell = Math.min(stock.longShares, Math.floor((sellAmount + commission - totalMoney) / stock.bidPrice));
						let salePrice = ns.stock.sellStock(stock.sym, sharesToSell);
						let saleTotal = salePrice * sharesToSell - commission;
						totalMoney += saleTotal;
						stock.longShares -= sharesToSell;
					}
				}
				totalMoney = Math.max(0, totalMoney);
				stockActionPort.write(JSON.stringify(["SYNACK", totalMoney]));
				await stockActionPort.nextWrite();
				stockActionPort.read();
			}
		}
	}
}

/** @param {NS} ns */
export function getAllStocks(ns) {
	// make a lookup table of all stocks and all their properties
	const stockSymbols = ns.stock.getSymbols();
	const stocks = []; // [{data}, ...]
	for (const sym of stockSymbols) {

		const pos = ns.stock.getPosition(sym);
		const stock = {
			sym: sym,
			longShares: pos[0],
			longPrice: pos[1],
			shortShares: pos[2],
			shortPrice: pos[3],
			forecast: ns.stock.getForecast(sym),
			volatility: ns.stock.getVolatility(sym),
			askPrice: ns.stock.getAskPrice(sym),
			bidPrice: ns.stock.getBidPrice(sym),
			maxShares: ns.stock.getMaxShares(sym),
		};

		var longProfit = stock.longShares * (stock.bidPrice - stock.longPrice) - 2 * commission;
		var shortProfit = stock.shortShares * (stock.shortPrice - stock.askPrice) - 2 * commission;
		stock.profit = longProfit + shortProfit;
		stock.cost = (stock.longShares * stock.longPrice) + (stock.shortShares * stock.shortPrice)

		// profit potential as chance for profit * effect of profit
		var profitChance = 2 * Math.abs(stock.forecast - 0.5);
		var profitPotential = profitChance * (stock.volatility);
		stock.profitPotential = profitPotential;

		stock.summary = `${stock.sym}: ${stock.forecast.toFixed(3)} ± ${stock.volatility.toFixed(3)}`;
		stocks.push(stock);
	}
	return stocks;
}

/** @param {NS} ns */
function getSymServer(sym) {
	const symServer = {
		"WDS": "",
		"ECP": "ecorp",
		"MGCP": "megacorp",
		"BLD": "blade",
		"CLRK": "clarkinc",
		"OMTK": "omnitek",
		"FSIG": "4sigma",
		"KGI": "kuai-gong",
		"DCOMM": "defcomm",
		"VITA": "vitalife",
		"ICRS": "icarus",
		"UNV": "univ-energy",
		"AERO": "aerocorp",
		"SLRS": "solaris",
		"GPH": "global-pharm",
		"NVMD": "nova-med",
		"LXO": "lexo-corp",
		"RHOC": "rho-construction",
		"APHE": "alpha-ent",
		"SYSC": "syscore",
		"CTK": "comptek",
		"NTLK": "netlink",
		"OMGA": "omega-net",
		"JGN": "joesguns",
		"SGC": "sigma-cosmetics",
		"CTYS": "catalyst",
		"MDYN": "microdyne",
		"TITN": "titan-labs",
		"FLCM": "fulcrumtech",
		"STM": "stormtech",
		"HLS": "helios",
		"OMN": "omnia",
		"FNS": "foodnstuff"
	}

	return symServer[sym];

}