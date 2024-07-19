/** @param {NS} ns */
export async function main(ns) {
	const portHandle = ns.getPortHandle(6);
	if(portHandle.empty()) portHandle.clear();
	portHandle.write("RESET");
}