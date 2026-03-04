/**
 * Controllers / route factories for the Document Service.
 * Plain Express Router-based (tsoa can be layered in later).
 *
 * Rule: no business logic inside controllers.
 * Rule: no direct Repository or ORM imports — delegate to Services.
 */
export { create_document_routes } from "../routes/document_routes.js";
export { create_workspace_routes } from "../routes/workspace_routes.js";
