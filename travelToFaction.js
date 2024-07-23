/** @param {NS} ns */
export async function main(ns) {
	const stockActionPort = ns.getPortHandle(5);
	ns.singularity.travelToCity(ns.args[0]);
	await ns.sleep(5000);
	stockActionPort.write(JSON.stringify(['ACK', true]));
}