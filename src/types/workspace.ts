export type WorkspaceType = "personal" | "team";

export type WorkspaceRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
  linkedChatId?: string;
  emoji?: string;
  color?: string;
}

export interface WorkspaceMember {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  displayName?: string;
  username?: string;
}

export interface WorkspaceInvite {
  workspaceId: string;
  workspaceName: string;
  invitedBy: string;
  createdAt: string;
  expiresAt?: string;
}
