var log = require('console-log-level')({
	level: 'info',
	prefix: function (level) {
		var color = ''
		if (level === 'error') color = '\x1b[31m'
		if (level === 'warn') color = '\x1b[33m'
		if (level === 'info') color = '\x1b[32m'
		if (level === 'fatal') color = '\x1b[35m'
		return '[' + new Date().toISOString() + '] ' + color + '[' + level.toUpperCase() + ']\x1b[0m'
	}
})
const cliProgress = require('cli-progress');
var readlineSync = require('readline-sync');
const Imap = require('imap');
const inspect = require('util').inspect;
const {simpleParser} = require('mailparser');
const nodemailer = require("nodemailer");

const fs = require('fs')
const server = JSON.parse(fs.readFileSync('serverList.json'));

log.info('Package loaded !')

var email = ''
var password = ''
var imapServer = ''
var imapPort = 993


function decode(charset, encoding, text) {
	switch (encoding) {
		case 'Q':
			return text.replace(/=[\da-fA-F]{2}/g, (match) => {
				return String.fromCharCode(parseInt(match.substr(1), 16));
			});
		case 'B':
			return decodeBase64(charset, text)
		default:
			return text
	}
}

function login() {
	if (fs.existsSync('login.json')) {
		log.info('Finded login.json ! Parsing...')
		var login = JSON.parse(fs.readFileSync('login.json'))
		if (login.hasOwnProperty('username') && login.hasOwnProperty('password') && login.hasOwnProperty('host') && login.hasOwnProperty('port')) {
			email = login.username
			password = login.password
			imapServer = login.host
			imapPort = login.port
			log.info('Login.json valid ! Unsing values...')
			return
		} else {
			log.error('Invalid login.json ! Must contains email, password, host and port !')
		}
	}

	function getEmail() {
		email = readlineSync.question('Enter your mail : ', {hideEchoBack: false})
		if (!email.toLowerCase().match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)) {
			log.error('Invalid mail !')
			if (email != 'stop') {
				return getEmail()
			} else {
				process.exit()
			}
		} else {
			imapServer = 'imap.' + email.split('@')[1]
			console.log(email)
		}
	}

	getEmail()

	function getPassword() {
		password = readlineSync.question('Enter your password : ', {hideEchoBack: true})
		if (password.length < 8) {
			log.error('Invalid password !')
			return getPassword()
		}
	}

	getPassword()

	function getDefaultImapServerAndPort() {
		var mailServer = email.split('@')[1]
		var defaultServer = 'imap.' + mailServer
		var defaultPort = 993
		log.info('Searching for server ' + mailServer + '...')
		if (server.hasOwnProperty(mailServer)) {
			log.info('Server found ! Checking alias...')
			if (server[mailServer].hasOwnProperty('alias')) {
				log.info('Alias found ! Resolving...')
				mailServer = server[mailServer].alias
			} else {
				log.info('Not an alias !')
			}
			imapServer = server[mailServer]['imap_host']
			imapPort = server[mailServer]['imap_port']
		}
	}

	getDefaultImapServerAndPort()

	var useDefault = readlineSync.keyInYN('Do you want to use ' + imapServer + ' as imap server ?')

	if (!useDefault) {
		imapServer = readlineSync.question('Enter your imap server : ', {defaultInput: imapServer})

		function getImapPort() {
			imapPort = readlineSync.question('Enter your imap port : ', {defaultInput: imapPort})
			if (isNaN(imapPort)) {
				log.error('Invalid port !')
				return getImapPort()
			}
		}

		getImapPort()
	}
}

login()
log.info('Connecting to imap server...')

const imap = new Imap({
	user: email,
	password: password,
	host: imapServer,
	port: imapPort,
	tls: true
});

imap.once('error', function (err) {
	log.error(err.message)
	log.info('Try to relogin...')
	login()
});

imap.once('end', function () {
	log.info('Successfully disconnected from imap server !')
});

imap.once('ready', function () {
	log.info('Connected to imap server ! Getting boxes...')
	var boxList = []
	imap.getBoxes(function (err, boxes) {
		if (err) {
			log.error(err.message)
			process.exit()
		}
		boxList = Object.keys(boxes)
		log.info(`${boxList.length} boxes found !`)

		if (fs.existsSync('login.json')) {
			log.info('Finded login.json ! Parsing...')
			var login = JSON.parse(fs.readFileSync('login.json'))
			if (login.hasOwnProperty('box')) {
				boxList = login.box
			}
		}

		boxList.forEach((boxName) => {
			log.info('Connecting to box ' + boxName + '...')
			imap.openBox(boxName, function (err, box) {
				if (err) {
					log.error(err.message)
					log.warn('Skipping box ' + boxName + '...')
					return
				}
				var i = 1
				var toUnsubscribe = []
				const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
				log.info('Box ' + boxName + ' connected !')
				const f = imap.seq.fetch('1:*', {bodies: ''});
				bar.start(box.messages.total, 0);
				f.on('message', msg => {
					msg.on('attributes', attrs => {
						uid = attrs.uid
					})
					msg.on('body', stream => {
						simpleParser(stream, async (err, parsed) => {
							parsed.uid = uid
							if (parsed.hasOwnProperty('textAsHtml') && parsed.textAsHtml.includes('unsubscribe')) {
								//toUnsubscribe.push(parsed); // Décommentez si nécessaire
								return; // Pas besoin de continuer si "unsubscribe" est trouvé
							}

							const hasListUnsubscribe = parsed.headerLines.some(header => header.key === 'list-unsubscribe');
							if (hasListUnsubscribe) {
								toUnsubscribe.push(parsed);
							}
						});
					});
					bar.update(i++);
				});
				f.once('error', ex => {
					log.error(ex)
				});
				f.once('end', () => {
					bar.stop();
					log.info('Found ' + toUnsubscribe.length + ' undesirable mail !')
					var transporter = null
					var sendMail = false
					var mailServer = email.split('@')[1]
					if (server.hasOwnProperty(mailServer)) {
						if (server[mailServer].hasOwnProperty('alias')) {
							mailServer = server[mailServer].alias
						}
						let smtpServer = server[mailServer]['smtp_host']
						let smtpPort = server[mailServer]['smtp_port']
						transporter = nodemailer.createTransport({
							host: smtpServer,
							port: smtpPort,
							secure: true,
							auth: {
								user: email,
								pass: password,
							},
						});

						if (readlineSync.keyInYN('Do you want to send a mail to unsubscribe ?')) {
							sendMail = true
						}
					}
					delay = 0
					emailToSent = 0
					emailSent = 0
					toUnsubscribe.forEach((mail) => {
						log.info('Unsubscribing from ' + mail.from.text + '...')
						let unsubscribeHeaders = mail.headerLines
							.filter(header => header.key === 'list-unsubscribe')
							.map(header => {
								var line = header.line
								line = line.replace('List-Unsubscribe:', '')
								var totalLine = ''
								line.split('\n').forEach((lineSeparated) => {
									lineSeparated = lineSeparated.trim()
									if (lineSeparated.startsWith('=?') && lineSeparated.endsWith('?=')) {
										lineSeparated = lineSeparated.slice(2, -2).split('?')
										lineSeparated = decode(lineSeparated[0], lineSeparated[1], lineSeparated[2])
									}
									totalLine += lineSeparated
								})
								line = totalLine
								return line
							});
						unsubscribeHeaders = unsubscribeHeaders[0].split(',')
						log.info('Checking avaible method...')
						var method = []
						unsubscribeHeaders.forEach((header) => {
							if (header.startsWith('<mailto:') && header.endsWith('>')) {
								method.push({id: 0, data: header.replaceAll('<mailto:', '').replaceAll('>', '')})
							}
							if (header.startsWith('<http') && header.endsWith('>')) {
								method.push({id: 1, data: header.replaceAll('<', '').replaceAll('>', '')})
							}
						})
						if (method.length == 0) {
							log.warn('No method found to unsubscribe from ' + mail.from.text + ' !')
							return
						}
						log.info('Found ' + method.length + ' method !')
						method.forEach(async (method) => {
							if (method.id == 1) {
								let success = await methodWebLink(method.data)
								if (success) {
									return
								}
							}
							if (method.id == 0) {
								if (sendMail) {
									log.info('Sending mail to ' + method.data + '...')
									emailToSent+=1
									setTimeout(async () => {
										try {
											await transporter.sendMail({
												from: email,
												to: method.data,
												subject: 'Unsubscribe from ' + mail.from.text,
												text: 'Unsubscribe',
											});
											log.info('Mail sent ! Unsubscribed from ' + mail.from.text + ' !')
										} catch (e) {
											log.error('Can\'t send mail to ' + method.data + ' !')
											log.error(e.message)
										}
										emailSent+=1
									}, delay)
									delay += 1000
								}
								try {

								} catch (e) {
									log.error(e)
								}
							}
							if(mail.uid != null) {
								imap.addFlags(mail.uid, '\\Deleted', (err) => {
									if (err) {
										log.error(err)
									}
								})
							}
						})
					})
					const bar2 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
					bar2.start(emailToSent, emailSent);
					while (emailToSent != emailSent) {
						bar2.update(emailSent)
					}
					bar2.stop()
				});
			})
		})
		//imap.end()
	})
})

imap.connect()

while (!imap.state == 'authenticated') {
	console.log('Waiting for imap server...')
}

async function methodWebLink(data) {
	log.info('Applying link method...')
	try {
		let data = await fetch(data, {
			method: 'GET',
			mode: 'no-cors',
			cache: 'no-cache',
			credentials: 'same-origin',
			headers: {'Content-Type': 'text/html'},
			redirect: 'follow',
			referrerPolicy: 'no-referrer'
		})
		if (data.status == 200) {
			log.info('Response is ok !')
			log.warn('Sometime these method doesn\'t work !')
			return true
		} else {
			log.error('Error while unsubscribing !')
			log.info('Trying next method...')
		}
	} catch (e) {
		log.error('Can\'t connect to ' + data + ' !')
	}
	return false
}
