/** @param {NS} ns */
export async function main(ns) {
	const target = ns.args[0];
	const cur = ns.singularity.getCurrentServer();

	var networkPath = [cur];
	var networkPath = scanAll(ns, cur, target, networkPath);

	for (var server of networkPath) {
		ns.singularity.connect(server);
	}
}

/** @param {NS} ns */
function scanAll(ns, start, target, path) {
	var connectedHosts = ns.scan(start);
	var finalPath = null;
	for (var host of connectedHosts) {
		if (!path.includes(host)) {
			path.push(host);
			if (host == target) {
				ns.print("Found path: " + path)
				return path;
			}
			finalPath = scanAll(ns, host, target, path);
			if (finalPath != null) {
				return finalPath;
			}
			else {
				// we did not find the target following the network map of this server.
				path.pop();
			}
		}
	}
}