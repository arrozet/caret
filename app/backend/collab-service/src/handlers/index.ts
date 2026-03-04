/**
 * WebSocket handlers for the Collaboration Service.
 * Handlers are the entry point for incoming WebSocket connections — equivalent to Controllers in REST.
 * Each handler: validates the connection, delegates Y.js CRDT sync to the Service layer.
 *
 * Rule: no business logic here — delegate to Services.
 * Rule: no direct DB access — delegate to Repositories via Services.
 */
export {};
