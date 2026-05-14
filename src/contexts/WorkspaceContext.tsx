import {
  createContext,
  useContext,
  useState,
  useCallback,
  PropsWithChildren,
} from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
} from "firebase/firestore";
import { Workspace, WorkspaceRole } from "@/types/workspace";
import { paths, PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeWorkspace: Workspace | null;
  role: WorkspaceRole;
  isLoaded: boolean;
  setActiveWorkspaceId: (id: string) => void;
  loadWorkspaces: (userId: string) => Promise<void>;
  createTeamWorkspace: (
    userId: string,
    name: string,
    emoji?: string
  ) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWorkspaceId: PERSONAL_WORKSPACE_ID,
  activeWorkspace: null,
  role: "owner",
  isLoaded: false,
  setActiveWorkspaceId: () => {},
  loadWorkspaces: async () => {},
  createTeamWorkspace: async () => ({} as Workspace),
});

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(
    () =>
      localStorage.getItem("cortex-active-workspace") ||
      PERSONAL_WORKSPACE_ID
  );
  const [isLoaded, setIsLoaded] = useState(false);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem("cortex-active-workspace", id);
  }, []);

  const ensurePersonalWorkspace = useCallback(
    async (userId: string): Promise<Workspace> => {
      const ref = doc(
        db,
        paths.userWorkspace(userId, PERSONAL_WORKSPACE_ID)
      );
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data() as Workspace;

      const personal: Workspace = {
        id: PERSONAL_WORKSPACE_ID,
        name: "Личное",
        type: "personal",
        ownerId: userId,
        createdAt: new Date().toISOString(),
        emoji: "👤",
        color: "#3b82f6",
      };
      await setDoc(ref, personal);
      return personal;
    },
    []
  );

  const loadWorkspaces = useCallback(
    async (userId: string) => {
      if (!userId || userId === "unknown") {
        setIsLoaded(true);
        return;
      }
      try {
        const personal = await ensurePersonalWorkspace(userId);
        const snap = await getDocs(
          collection(db, paths.userWorkspaces(userId))
        );
        const all: Workspace[] = [];
        snap.forEach((d) => all.push(d.data() as Workspace));

        // Личный всегда первый
        const sorted = [
          personal,
          ...all.filter((w) => w.id !== PERSONAL_WORKSPACE_ID),
        ];
        setWorkspaces(sorted);
      } catch (e) {
        console.error("loadWorkspaces:", e);
        setWorkspaces([
          {
            id: PERSONAL_WORKSPACE_ID,
            name: "Личное",
            type: "personal",
            ownerId: userId,
            createdAt: new Date().toISOString(),
            emoji: "👤",
            color: "#3b82f6",
          },
        ]);
      } finally {
        setIsLoaded(true);
      }
    },
    [ensurePersonalWorkspace]
  );

  const createTeamWorkspace = useCallback(
    async (
      userId: string,
      name: string,
      emoji = "👥"
    ): Promise<Workspace> => {
      const id = `team_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 6)}`;
      const workspace: Workspace = {
        id,
        name,
        type: "team",
        ownerId: userId,
        createdAt: new Date().toISOString(),
        emoji,
        color: "#6366f1",
      };
      await setDoc(
        doc(db, paths.userWorkspace(userId, id)),
        workspace
      );
      setWorkspaces((prev) => [...prev, workspace]);
      return workspace;
    },
    []
  );

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ??
    workspaces[0] ??
    null;

  // Роль: для личного всегда owner
  const role: WorkspaceRole =
    activeWorkspace?.ownerId === activeWorkspace?.ownerId
      ? "owner"
      : "member";

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspaceId,
        activeWorkspace,
        role,
        isLoaded,
        setActiveWorkspaceId,
        loadWorkspaces,
        createTeamWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
