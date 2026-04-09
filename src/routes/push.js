'use strict';

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const webPush = require('web-push');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PUBLIC_KEY_PATH = path.join(DATA_DIR, 'vapid-public.key');
const PRIVATE_KEY_PATH = path.join(DATA_DIR, 'vapid-private.key');

let vapidPublicKey;
let vapidPrivateKey;

// Generate or load VAPID keys
function initVapid() {
  if (fs.existsSync(PUBLIC_KEY_PATH) && fs.existsSync(PRIVATE_KEY_PATH)) {
    vapidPublicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8').trim();
    vapidPrivateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8').trim();
  } else {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const keys = webPush.generateVAPIDKeys();
    vapidPublicKey = keys.publicKey;
    vapidPrivateKey = keys.privateKey;
    fs.writeFileSync(PUBLIC_KEY_PATH, vapidPublicKey);
    fs.writeFileSync(PRIVATE_KEY_PATH, vapidPrivateKey);
  }
  webPush.setVapidDetails('mailto:noreply@localhost', vapidPublicKey, vapidPrivateKey);
}

initVapid();

async function sendNotification(db, title, body) {
  const subs = db.getPushSubscriptions();
  const results = [];
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body })
      );
      results.push({ endpoint: sub.endpoint, ok: true });
    } catch (err) {
      // Remove invalid subscriptions (410 Gone)
      if (err.statusCode === 410) {
        db.removePushSubscription(sub.endpoint);
      }
      results.push({ endpoint: sub.endpoint, ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = function (db) {
  router.get('/push/vapid-key', (req, res) => {
    try {
      res.json({ publicKey: vapidPublicKey });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/push/subscribe', (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys) {
        return res.status(400).json({ error: 'endpoint and keys are required' });
      }
      db.addPushSubscription(endpoint, keys);
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/push/unsubscribe', (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
      db.removePushSubscription(endpoint);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

module.exports.sendNotification = sendNotification;
