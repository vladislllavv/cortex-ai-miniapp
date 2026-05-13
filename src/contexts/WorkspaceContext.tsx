import {
  createContext,
  useContext,
  useState,
  useEffect,
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
import {
  Workspace,
  WorkspaceRole,
} from "@/types/workspace";
import { paths, PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeWorkspace: Workspace | null;
  role: WorkspaceRole;
  setActiveWorkspaceId: (id: string) => void;
  loadWorkspaces: (userId: string) => Promise<void>;
  isLoaded: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWorkspaceId: PERSONAL_WORKSPACE_ID,
  activeWorkspace: null,
  role: "owner",
  setActiveWorkspaceId: () => {},
  loadWorkspaces: async () => {},
  isLoaded: false,
});

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(
    () => localStorage.getItem("cortex-active-workspace") || PERSONAL_WORKSPACE_ID
  );
  const [isLoaded, setIsLoaded] = useState(false);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem("cortex-active-workspace", id);
  }, []);

  const ensurePersonalWorkspace = useCallback(
    async (userId: string): Promise<Workspace> => {
      const personalRef = doc(
        db,
        paths.userWorkspace(userId, PERSONAL_WORKSPACE_ID)
      );
      const snap = await getDoc(personalRef);

      if (snap.exists()) {
        return snap.data() as Workspace;
      }

      const personal: Workspace = {
        id: PERSONAL_WORKSPACE_ID,
        name: "Личное",
        type: "personal",
        ownerId: userId,
        createdAt: new Date().toISOString(),
        emoji: "👤",
        color: "#3b82f6",
      };

      await setDoc(personalRef, personal);
      return personal;
    },
    []
  );

  const loadWorkspaces = useCallback(async (userId: string) => {
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
      console.error("Load workspaces error:", e);
      // Fallback — показываем личный
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
  }, [ensurePersonalWorkspace]);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  // Роль — для личного всегда owner
  const role: WorkspaceRole =
    activeWorkspace?.type === "personal" ? "owner" : "owner";

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspaceId,
        activeWorkspace,
        role,
        setActiveWorkspaceId,
        loadWorkspaces,
        isLoaded,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
