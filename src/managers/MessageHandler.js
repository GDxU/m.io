var Player = require('../entities/Player');
var log = require('../utils/Logger');
const Utils = require('../utils/Utils');
const PACKET = require('../utils/packetCodes');

class MessageHandler {
	checkConnection(socket) {
		if (!socket.player.connected) {
			this.manager.close(socket, 'Connection handshake not completed.');
		}
		return socket.player.connected;
	}
	conn(socket) {
		if (socket.player.connected) {
			// For some reason the client sent a connection packet while already connected
			this.manager.close(socket, 'Invalid connection');
		} else {
			// The client is now connected
			socket.player.connected = true;
			// Update the player's time
			this.manager.updateTime(socket);
		}
	}
	disconn(socket) {
		log.all('Player disconnected,', socket.player.name);
		this.manager.remove(socket);
	}
	angle(socket, ang) {
		// Player angle update
		if (socket.player.connected)
			socket.player.angle = ang;
	}
	move(socket, key, down) {
		if (socket.player.connected && key && typeof down === "number") {
			// The player has sent a valid move packet
			var boolDown = !!down;
			switch (key) {
				case "u":
				case "d":
					socket.player.dirY = key;
					socket.player.downY = boolDown;
					break;
				case "l":
				case "r":
					socket.player.dirX = key;
					socket.player.downX = boolDown;
					break;
			}
		}
	}
	chat(socket, msg) {
		// Player chat recieved
		for (var i = 0; i < socket.player.playersNear.length; ++i) {
			this.manager.sendChat(socket, socket.player.playersNear[i], msg);
		}
	}
	syncClanPlayers(socket) {
		var data = socket.player.clan.serializeMembers();
		socket.emit(PACKET.SET_CLAN_PLAYERS, data);
	}
	deleteClan(clan) {
		this.io.emit(PACKET.CLAN_DEL, clan.name);
		this.clans.remove(clan.name);
	}
	clanLeave(socket) {
		if (socket.player.team) {
			// It's safe to remove the player's clan
			log.all('Player "' + socket.player.name + "\" is leaving their clan " + socket.player.team);
			if (socket.player.clan.isPlayerOwner(socket)) {
				this.msgHandler.deleteClan.call(this, socket.player.clan);
			}
			for (var i = 0; i < socket.player.clan.members.length; ++i) {
				this.msgHandler.syncClanPlayers(socket.player.clan.members[i]);
			}
			socket.player.clan.removePlayer(socket);
		}
	}
	clanCreate(socket, clanName) {
		// TODO: handle clan creation attempts
		if (!this.clans.clanExists(clanName)) {
			// It's safe to add the clan
			this.clans.add(clanName);
			var newClanData = this.clans.newestClan.serialize();
			this.clans.newestClan.addPlayer(socket);
			// Broadcast the creation of a new clan
			this.io.emit(PACKET.CLAN_ADD, newClanData);
			// Set the player's clan to the new clan
			socket.emit(PACKET.PLAYER_SET_CLAN, newClanData.sid, 1);
			this.msgHandler.syncClanPlayers(socket);
			log.all("Clan '" + clanName + "' has been created by " + socket.player.name);
		}
	}
	spawn(socket, data) {
		if (!this.msgHandler.checkConnection(socket))
			return;
		if (socket.player.spawned) {
			this.manager.close(socket, 'You are already spawned.');
		} else {
			// Player can spawn, update their name
			var name = data.name.trim();
			if (name === "") 
				name = this.config.unknownName;
			socket.player.name = name;
			// Update player coords. This will be better eventually
			socket.player.x = Utils.rand(this.config.mapSize);
			socket.player.y = Utils.rand(this.config.mapSize);
			
			var me = this;
			me.manager.sendStart(socket);
			setTimeout(() => {
				// Send player data to player
				me.manager.addSelfPlayer(socket);
				// New players get an empty update packet
				me.manager.sendRawUpdate(socket, []);
				log.all("Spawned player with name", socket.player.name);
				socket.player.alive = true;
			}, 10);
		}
	}
	constructor(gameServer) {
		this.gameServer = gameServer;
	}
}
module.exports = MessageHandler;