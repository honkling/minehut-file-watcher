#!/usr/bin/env node
let Config = require('conf');
let yargsParser = require('yargs-parser');
let colors = require('colors');
let chokidar = require('chokidar');
let fetch = require('node-fetch');
let fs = require('fs');
let path = require('path');

let argv = yargsParser(process.argv.slice(2));
let config = new Config();

let showHelpCommand = true;

const MINEHUT_API_BASE = 'https://api.minehut.com';

if (argv.setauthtoken) {
	if (typeof argv.setauthtoken !== 'string')
		return console.error('Token must be a string'.bold.red);
	config.set('auth.token', argv.setauthtoken);
	console.log(`Set token to ${argv.setauthtoken}`.green);
	showHelpCommand = false;
}

if (argv.setsession) {
	if (typeof argv.setsession === 'boolean')
		return console.error('You must provide a session id'.bold.red);
	config.set('auth.session', argv.setsession);
	console.log(`Set session id`.green);
	showHelpCommand = false;
}

if (argv.setserver) {
	if (typeof argv.setserver !== 'string')
		return console.error('Server name must be a string'.bold.red);
	(async () => {
		const res = await fetch(
			`${MINEHUT_API_BASE}/server/${argv.setserver}?byName=true`
		);
		if (!res.ok)
			throw new HttpError(
				`Bad response when fetching server ID: ${res.status}`
			);
		const json = await res.json();
		config.set('server_id', json.server._id);
		console.log(
			`Set server ID to ${json.server._id} (${json.server.name})`.green
		);
	})();
	showHelpCommand = false;
}

if (argv.getconfig) {
	console.log(config.store);
	showHelpCommand = false;
}

if (argv._.length > 0) {
	if (argv._.length > 1)
		return console.error('You can only watch one file at a time!'.red);
	if (!config.get('server_id'))
		return console.error(
			"You haven't set a server ID in config. Run `mh-watch` for help.".red
		);
	if (!config.get('auth.token') || !config.get('auth.session'))
		return console.error(
			'Check your token and session id in config. Run `mh-watch` for help.'.red
		);
	if (!argv.minehutpath)
		return console.error(
			'No Minehut path provided, where am I supposed to send the file?\nExample: mh-watch config.yml --minehutpath=plugins/Essentials/config.yml'
				.bold.red
		);

	(async () => {
		console.log('Validating token and session id ...'.yellow);
		const res = await fetch(`${MINEHUT_API_BASE}/server/${config.get('server_id')}/all_data`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent':
					'minehut-file-watcher (https://github.com/jellz/minehut-file-watcher)',
				'authorization': config.get('auth.token'),
				'x-session-id': config.get('auth.session'),
			},
		});
		if (!res.server) return console.error('Invalid token or session id.');
		console.log('Token and session id are valid.'.green);

		let remotePath = argv.minehutpath;
		let localPath = path.join(process.cwd(), argv._[0]);
		fs.readFile(localPath, 'UTF-8', (err, data) => {
			if (err) throw err;
			console.log(
				'Watching for file changes to '.green + argv._[0].red + '...'.green
			);
			let previousData = data;
			let watcher = chokidar.watch(localPath, {
				persistent: true,
			});
			watcher.on('change', path => {
				fs.readFile(localPath, 'UTF-8', async (err, data) => {
					if (err) throw err;
					if (previousData === data) return;
					console.log(
						'File '.green +
							path.red +
							' updated content, sending API request'.green
					);
					previousData = data;
					let res = await fetch(
						`${MINEHUT_API_BASE}/file/${config.get(
							'server_id'
						)}/edit/${remotePath}`,
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Authorization: config.get('auth.token'),
								'User-Agent':
									'minehut-file-watcher (https://github.com/jellz/minehut-file-watcher)',
								'X-Session-ID': config.get('auth.session_id'),
							},
							body: JSON.stringify({
								content: previousData,
							}),
						}
					);
					if (!(await res.ok))
						throw new HttpError(
							`Bad response: ${JSON.stringify(await res.json())}`
						);
					console.log('Updated file '.green + remotePath.red);
				});
			});
		});
	})();
	showHelpCommand = false;
}

if (showHelpCommand) {
	console.log(
		[
			'minehut-file-watcher'.green.underline,
			'',
			'Like the project? Star the repo!'.bold.red,
			'https://github.com/jellz/minehut-file-watcher/stargazers'.white,
			'',
			'--setserver=<server name>'.bold.white,
			'Set the server to push files to (persistent)'.yellow,
			'',
			'--setemail=<email address>'.bold.white,
			'Set the email to use to authenticate with Minehut (persistent)'.yellow,
			'',
			'--setpassword=<password>'.bold.white,
			'Set the password to use to authenticate with Minehut (persistent)'
				.yellow,
			'',
			'--getconfig'.bold.white,
			'Get your current config. Useful for debugging.'.yellow,
			'',
			'--minehutpath=<remote path>'.bold.white,
			'Set the path of the file you want to update remotely'.yellow,
			'',
			'After setting the above persistent config values, use '.bold.white +
				'mh-watch <file> (--minehutpath=<remote path>)'.bold.red +
				'.'.bold.white,
			'',
			'For more information check out the GitHub repo!'.bold.green,
			'https://github.com/jellz/minehut-file-watcher'.white,
			'',
		].join('\n')
	);
}

class HttpError extends Error {
	constructor(message) {
		super(message);
		this.name = 'HttpError';
	}
}
