import { MQTT_BROKER, MQTT_PASSWORD, MQTT_USERNAME } from '../config';

let mqttClient: any = null;
let mqttInitInFlight = false;
let mqttSubscribedTopic = '';

function parseBroker(rawBroker: string) {
	const v = String(rawBroker || '').trim();
	if (!v) return { host: 'mqtt.serbia70.com', port: 443, path: '/mqtt', useSSL: true };
	if (v.startsWith('ws://') || v.startsWith('wss://')) {
		try {
			const u = new URL(v);
			return {
				host: u.hostname,
				port: Number(u.port || (u.protocol === 'wss:' ? 443 : 80)),
				path: u.pathname || '/mqtt',
				useSSL: u.protocol === 'wss:',
			};
		} catch {}
	}
	if (v.includes('serbia70.com')) {
		return { host: 'mqtt.serbia70.com', port: 443, path: '/mqtt', useSSL: true };
	}
	return { host: v, port: 8083, path: '/mqtt', useSSL: false };
}

export function ensureUserChatRealtime(options: {
	shopId: number;
	userPhone: string;
	onMessage: (payload: any) => void;
}) {
	const shopId = Number(options.shopId || 0);
	const userPhone = String(options.userPhone || '').trim();
	if (!shopId || !userPhone || typeof window === 'undefined') return;
	if (typeof (window as any).Paho === 'undefined') return;
	if (mqttInitInFlight) return;

	const topic = `shop/${shopId}/chat/${userPhone}`;
	const b = parseBroker(MQTT_BROKER);
	const clientId = `uc_shared_${shopId}_${Math.random().toString(16).slice(2, 8)}`;

	try {
		if (mqttClient && (mqttClient.connected || (typeof mqttClient.isConnected === 'function' && mqttClient.isConnected()))) {
			if (mqttSubscribedTopic && mqttSubscribedTopic !== topic) {
				try { mqttClient.unsubscribe(mqttSubscribedTopic); } catch {}
			}
			mqttSubscribedTopic = topic;
			try { mqttClient.subscribe(topic); } catch {}
			return;
		}
	} catch {}

	mqttInitInFlight = true;
	mqttClient = new (window as any).Paho.MQTT.Client(b.host, Number(b.port), b.path || '/mqtt', clientId);
	mqttSubscribedTopic = topic;
	mqttClient.onConnectionLost = function() {
		mqttInitInFlight = false;
		setTimeout(() => ensureUserChatRealtime(options), 1500);
	};
	mqttClient.onMessageArrived = function(message: any) {
		try {
			const payload = JSON.parse(message?.payloadString || '{}');
			options.onMessage(payload);
		} catch {}
	};

	const connectOptions: any = {
		useSSL: !!b.useSSL,
		timeout: 5,
		keepAliveInterval: 60,
		onSuccess() {
			mqttInitInFlight = false;
			try { mqttClient.subscribe(topic); } catch {}
		},
		onFailure() {
			mqttInitInFlight = false;
			setTimeout(() => ensureUserChatRealtime(options), 1500);
		},
	};

	if (String(MQTT_USERNAME || '').trim()) connectOptions.userName = String(MQTT_USERNAME || '').trim();
	if (String(MQTT_PASSWORD || '').trim()) connectOptions.password = String(MQTT_PASSWORD || '');

	try {
		mqttClient.connect(connectOptions);
	} catch {
		mqttInitInFlight = false;
	}
}
