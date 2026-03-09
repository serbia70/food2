# MQTT Chat Realtime Design

## Goal
Enable real-time chat updates with audible notification for both user and admin chats, without page refresh.

## Context
- Existing chat APIs store messages in `chat_messages`.
- MQTT is already used for order/status updates via Paho client on the frontend.
- Frontend already loads MQTT broker settings and secret for shop pages.

## Approach (Chosen)
Use existing MQTT broker and publish chat events on per-shop, per-user topics.

## Topics
- User chat topic: `shop/{shopId}/chat/{phone}`
- Admin chat subscribes to `shop/{shopId}/chat/+`
- User chat subscribes to `shop/{shopId}/chat/{phone}`

## Message Payload
```
{
  "shop_id": 2,
  "sender_role": "user|admin",
  "sender_phone": "0613...",
  "message": "内容",
  "created_at": "ISO8601"
}
```

## Frontend Behavior
- Initial load uses HTTP to fetch history.
- MQTT delivers new messages; UI appends and auto-scrolls if panel open.
- If panel closed: show red badge + play sound.
- Audio enabled only after first user interaction to satisfy browser autoplay rules.

## Backend Behavior
- After successful chat send (user/admin), publish MQTT message to topic.
- Publish failure must not break HTTP response.

## Error Handling
- MQTT reconnect on disconnect.
- UI shows offline status but continues HTTP history load.

## Non-goals
- Full chat read receipts or typing indicators.
- Message persistence beyond existing database.
