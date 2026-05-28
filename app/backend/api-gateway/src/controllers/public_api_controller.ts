import {
  Body,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

/** Standard JSON error payload returned by gateway and downstream services. */
export interface ErrorResponseDto {
  /** Human-readable error message. */
  error: string;
}

/** Generic JSON object used for rich document content and AI context payloads. */
export type JsonObject = Record<string, unknown>;

/** Public document response returned through the API Gateway. */
export interface DocumentResponseDto {
  /** Document UUID. */
  id: string;
  /** Workspace this document belongs to. */
  workspace_id: string;
  /** Folder this document is in, or null for workspace root. */
  folder_id: string | null;
  /** Document title. */
  title: string;
  /** Lifecycle status. */
  status: string;
  /** Access scope. */
  visibility: string;
  /** Document owner user ID. */
  owner_user_id: string | null;
  /** Latest Tiptap/ProseMirror JSON content. */
  content_json?: JsonObject | null;
  /** Latest plain-text content. */
  content_text?: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 update timestamp. */
  updated_at: string;
}

/** Public workspace response returned through the API Gateway. */
export interface WorkspaceResponseDto {
  /** Workspace UUID. */
  id: string;
  /** URL-friendly slug. */
  slug: string | null;
  /** Display name. */
  name: string;
  /** Workspace kind. */
  kind: "personal" | "shared";
  /** User who created the workspace. */
  created_by_user_id: string | null;
  /** Caller's role in this workspace. */
  role?: string;
  /** Other active member emails excluding the caller. */
  shared_with?: string[];
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 update timestamp. */
  updated_at: string;
}

/** Public folder response returned through the API Gateway. */
export interface FolderResponseDto {
  /** Folder UUID. */
  id: string;
  /** Workspace this folder belongs to. */
  workspace_id: string;
  /** Parent folder UUID, or null for workspace root. */
  parent_folder_id: string | null;
  /** Folder display name. */
  name: string;
  /** Manual sort order, or null for default ordering. */
  sort_order: number | null;
  /** User who created the folder. */
  created_by_user_id: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 update timestamp. */
  updated_at: string;
}

/** Create document request body. */
export interface CreateDocumentRequestDto {
  /** Document title. */
  title: string;
  /** Target workspace UUID. */
  workspace_id: string;
  /** Optional target folder UUID. */
  folder_id?: string;
}

/** Update document request body. */
export interface UpdateDocumentRequestDto {
  /** Updated title. */
  title?: string;
  /** Updated workspace UUID when moving the document. */
  workspace_id?: string;
  /** Updated folder UUID, or null for workspace root. */
  folder_id?: string | null;
  /** Updated Tiptap/ProseMirror JSON content. */
  content_json?: JsonObject;
  /** Updated plain-text content. */
  content_text?: string;
}

/** Create workspace request body. */
export interface CreateWorkspaceRequestDto {
  /** Workspace display name. */
  name: string;
  /** Optional URL-friendly slug. */
  slug?: string;
  /** Workspace kind. */
  kind?: "personal" | "shared";
}

/** Update workspace request body. */
export interface UpdateWorkspaceRequestDto {
  /** Updated display name. */
  name?: string;
}

/** Create folder request body. */
export interface CreateFolderRequestDto {
  /** Workspace UUID. */
  workspace_id: string;
  /** Folder display name. */
  name: string;
  /** Optional parent folder UUID, or null for workspace root. */
  parent_folder_id?: string | null;
  /** Optional manual sort order. */
  sort_order?: number | null;
}

/** Update folder request body. */
export interface UpdateFolderRequestDto {
  /** Updated folder name. */
  name?: string;
  /** Updated parent folder UUID, or null for workspace root. */
  parent_folder_id?: string | null;
  /** Updated manual sort order. */
  sort_order?: number | null;
}

/** Invite collaborator request body. */
export interface InviteCollaboratorRequestDto {
  /** Target user email address. */
  email: string;
}

/** Workspace invite response. */
export interface InviteWorkspaceCollaboratorResponseDto {
  /** Workspace UUID. */
  workspace_id: string;
  /** Invited user UUID. */
  user_id: string;
  /** Invited user email. */
  email: string;
  /** Assigned role. */
  role: "member";
}

/** Direct document invite response. */
export interface InviteDocumentCollaboratorResponseDto {
  /** Document UUID. */
  document_id: string;
  /** Invited user UUID. */
  user_id: string;
  /** Invited user email. */
  email: string;
  /** Assigned document role. */
  role: "owner" | "editor" | "commenter" | "viewer";
  /** Invite scope. */
  scope: "document";
}

/** AI model catalog response. */
export interface ModelsResponseDto {
  /** Available model descriptors. */
  models: JsonObject[];
  /** Default model id selected by the server. */
  default_model_id: string;
}

/** AI conversation response. */
export interface ConversationResponseDto {
  /** Conversation UUID. */
  id: string;
  /** Document UUID. */
  document_id: string;
  /** Owner user UUID. */
  user_id: string;
  /** Optional conversation title. */
  title: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 update timestamp. */
  updated_at: string;
}

/** Create AI conversation request body. */
export interface CreateConversationRequestDto {
  /** Document UUID. */
  document_id: string;
  /** Optional conversation title. */
  title?: string;
}

/** AI conversation list response. */
export interface ConversationListResponseDto {
  /** Conversation list items. */
  items: JsonObject[];
  /** Total conversations available server-side. */
  total: number;
}

/** AI message list response. */
export interface MessageListResponseDto {
  /** Message list items. */
  items: JsonObject[];
  /** Total messages available server-side. */
  total: number;
}

/** Stream AI request body. */
export interface StreamConversationRequestDto {
  /** User message text. */
  message: string;
  /** Active document UUID. */
  document_id: string;
  /** Optional editor context snapshot. */
  document_context?: string | JsonObject;
  /** Optional agent type slug. */
  agent_type?: string;
}

/** Update AI suggestion status body. */
export interface UpdateSuggestionStatusRequestDto {
  /** New suggestion status. */
  status: "applied" | "dismissed" | "superseded";
}

/** AI suggestion response. */
export interface SuggestionResponseDto {
  /** Suggestion UUID. */
  id: string;
  /** Conversation UUID. */
  conversation_id: string;
  /** Document UUID. */
  document_id: string;
  /** Message UUID, when associated. */
  message_id: string | null;
  /** Suggestion lifecycle status. */
  status: string;
  /** Original text, when available. */
  original_text: string | null;
  /** Suggested replacement text. */
  suggested_text: string;
  /** Optional start offset. */
  position_start: number | null;
  /** Optional end offset. */
  position_end: number | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 update timestamp. */
  updated_at: string;
}

/** Index embeddings request body. */
export interface IndexEmbeddingsRequestDto {
  /** Document UUID. */
  document_id: string;
  /** Plain-text content to index. */
  content: string;
}

/** Index embeddings response. */
export interface IndexEmbeddingsResponseDto {
  /** Document UUID. */
  document_id: string;
  /** Number of chunks indexed. */
  chunks_indexed: number;
}

/**
 * OpenAPI metadata for the public API exposed through the gateway.
 * Runtime requests are still proxied by the existing Express route table.
 */
@Route("api/v1")
@Security("bearerAuth")
@Response<ErrorResponseDto>(401, "Unauthorized")
@Response<ErrorResponseDto>(403, "Forbidden")
@Response<ErrorResponseDto>(422, "Validation error")
export class PublicApiController {
  /** Create a document in a workspace. */
  @Tags("Documents")
  @Post("documents")
  @SuccessResponse(201, "Created")
  public async createDocument(
    @Body() _body: CreateDocumentRequestDto,
  ): Promise<DocumentResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** List documents in a workspace. */
  @Tags("Documents")
  @Get("documents")
  public async listDocuments(
    @Query("workspace_id") _workspace_id: string,
  ): Promise<DocumentResponseDto[]> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** List documents shared directly with the caller. */
  @Tags("Documents")
  @Get("documents/shared")
  public async listSharedDocuments(): Promise<DocumentResponseDto[]> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Get a document by ID. */
  @Tags("Documents")
  @Get("documents/{id}")
  public async getDocument(@Path("id") _id: string): Promise<DocumentResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Update a document's title, placement, or content. */
  @Tags("Documents")
  @Patch("documents/{id}")
  public async updateDocument(
    @Path("id") _id: string,
    @Body() _body: UpdateDocumentRequestDto,
  ): Promise<DocumentResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Soft-delete a document. */
  @Tags("Documents")
  @Delete("documents/{id}")
  @SuccessResponse(204, "No Content")
  public async deleteDocument(@Path("id") _id: string): Promise<void> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Invite a collaborator directly to a document. */
  @Tags("Documents")
  @Post("documents/{id}/invite")
  @SuccessResponse(201, "Created")
  public async inviteDocumentCollaborator(
    @Path("id") _id: string,
    @Body() _body: InviteCollaboratorRequestDto,
  ): Promise<InviteDocumentCollaboratorResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Create a workspace. */
  @Tags("Workspaces")
  @Post("workspaces")
  @SuccessResponse(201, "Created")
  public async createWorkspace(
    @Body() _body: CreateWorkspaceRequestDto,
  ): Promise<WorkspaceResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** List workspaces visible to the caller. */
  @Tags("Workspaces")
  @Get("workspaces")
  public async listWorkspaces(): Promise<WorkspaceResponseDto[]> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Update a workspace. */
  @Tags("Workspaces")
  @Patch("workspaces/{id}")
  public async updateWorkspace(
    @Path("id") _id: string,
    @Body() _body: UpdateWorkspaceRequestDto,
  ): Promise<WorkspaceResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Soft-delete a workspace. */
  @Tags("Workspaces")
  @Delete("workspaces/{id}")
  @SuccessResponse(204, "No Content")
  public async deleteWorkspace(@Path("id") _id: string): Promise<void> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Invite a collaborator to a workspace. */
  @Tags("Workspaces")
  @Post("workspaces/{id}/invite")
  @SuccessResponse(201, "Created")
  public async inviteWorkspaceCollaborator(
    @Path("id") _id: string,
    @Body() _body: InviteCollaboratorRequestDto,
  ): Promise<InviteWorkspaceCollaboratorResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Create a folder in a workspace. */
  @Tags("Folders")
  @Post("folders")
  @SuccessResponse(201, "Created")
  public async createFolder(@Body() _body: CreateFolderRequestDto): Promise<FolderResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** List folders in a workspace. */
  @Tags("Folders")
  @Get("folders")
  public async listFolders(
    @Query("workspace_id") _workspace_id: string,
    @Query("parent_folder_id") _parent_folder_id?: string,
  ): Promise<FolderResponseDto[]> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** List all folders in a workspace as a flat tree-building payload. */
  @Tags("Folders")
  @Get("folders/all")
  public async listAllFolders(
    @Query("workspace_id") _workspace_id: string,
  ): Promise<FolderResponseDto[]> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Update a folder. */
  @Tags("Folders")
  @Patch("folders/{id}")
  public async updateFolder(
    @Path("id") _id: string,
    @Body() _body: UpdateFolderRequestDto,
  ): Promise<FolderResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Soft-delete a folder. */
  @Tags("Folders")
  @Delete("folders/{id}")
  @SuccessResponse(204, "No Content")
  public async deleteFolder(@Path("id") _id: string): Promise<void> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Fetch the curated AI model catalog. */
  @Tags("AI")
  @Get("ai/models")
  public async getModels(): Promise<ModelsResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Create an AI conversation for a document. */
  @Tags("AI")
  @Post("ai/conversations")
  @SuccessResponse(201, "Created")
  public async createConversation(
    @Body() _body: CreateConversationRequestDto,
  ): Promise<ConversationResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** List AI conversations for a document. */
  @Tags("AI")
  @Get("ai/conversations")
  public async listConversations(
    @Query("document_id") _document_id: string,
  ): Promise<ConversationListResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Fetch all messages in an AI conversation. */
  @Tags("AI")
  @Get("ai/conversations/{conversation_id}/messages")
  public async listMessages(
    @Path("conversation_id") _conversation_id: string,
  ): Promise<MessageListResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Delete an AI conversation. */
  @Tags("AI")
  @Delete("ai/conversations/{conversation_id}")
  @SuccessResponse(204, "No Content")
  public async deleteConversation(
    @Path("conversation_id") _conversation_id: string,
  ): Promise<void> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Mark an AI conversation as recently used. */
  @Tags("AI")
  @Post("ai/conversations/{conversation_id}/touch")
  @SuccessResponse(204, "No Content")
  public async touchConversation(@Path("conversation_id") _conversation_id: string): Promise<void> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Stream an AI assistant response via Server-Sent Events. */
  @Tags("AI")
  @Post("ai/conversations/{conversation_id}/stream")
  public async streamConversation(
    @Path("conversation_id") _conversation_id: string,
    @Body() _body: StreamConversationRequestDto,
  ): Promise<string> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Update the lifecycle status of a persisted AI suggestion. */
  @Tags("AI")
  @Patch("ai/suggestions/{suggestion_id}/status")
  public async updateSuggestionStatus(
    @Path("suggestion_id") _suggestion_id: string,
    @Body() _body: UpdateSuggestionStatusRequestDto,
  ): Promise<SuggestionResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }

  /** Index document text into the vector store for retrieval. */
  @Tags("Embeddings")
  @Post("ai/embeddings/index")
  public async indexEmbeddings(
    @Body() _body: IndexEmbeddingsRequestDto,
  ): Promise<IndexEmbeddingsResponseDto> {
    throw new Error("PublicApiController is used for OpenAPI metadata only.");
  }
}
