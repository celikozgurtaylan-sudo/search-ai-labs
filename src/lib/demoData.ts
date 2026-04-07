export type DemoProjectRecord = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  analysis?: any;
  created_at: string;
  updated_at: string;
  archived: boolean;
  archived_at?: string | null;
};

export type DemoParticipantRecord = {
  id: string;
  project_id: string;
  email: string;
  name?: string;
  status: "invited" | "joined" | "completed" | "declined";
  invited_at?: string;
  joined_at?: string;
  completed_at?: string;
  invitation_token: string;
  token_expires_at?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
};

export type DemoSessionRecord = {
  id: string;
  project_id: string;
  participant_id?: string;
  session_token: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  notes?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
};

type DemoDatabase = {
  projects: DemoProjectRecord[];
  participants: DemoParticipantRecord[];
  sessions: DemoSessionRecord[];
};

const DEMO_DATA_STORAGE_KEY = "searcho-demo-data";

const emptyDatabase = (): DemoDatabase => ({
  projects: [],
  participants: [],
  sessions: [],
});

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}${crypto.randomUUID()}`;
  }

  return `${prefix}${Math.random().toString(36).slice(2, 11)}`;
};

const readDemoDatabase = (): DemoDatabase => {
  if (!canUseStorage()) return emptyDatabase();

  const rawValue = window.localStorage.getItem(DEMO_DATA_STORAGE_KEY);
  if (!rawValue) return emptyDatabase();

  try {
    const parsed = JSON.parse(rawValue) as Partial<DemoDatabase>;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return emptyDatabase();
  }
};

const writeDemoDatabase = (database: DemoDatabase) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify(database));
};

export const isDemoProjectId = (projectId?: string | null) => Boolean(projectId?.startsWith("mock-project-"));

export const isDemoInvitationToken = (token?: string | null) => Boolean(token?.startsWith("mock-invite-"));

export const isDemoSessionToken = (token?: string | null) => Boolean(token?.startsWith("mock-session-"));

export const createDemoProjectRecord = (userId: string, input: {
  title: string;
  description: string;
  analysis?: any;
}) => {
  const database = readDemoDatabase();
  const timestamp = new Date().toISOString();
  const project: DemoProjectRecord = {
    id: createId("mock-project-"),
    user_id: userId,
    title: input.title,
    description: input.description,
    analysis: input.analysis,
    created_at: timestamp,
    updated_at: timestamp,
    archived: false,
    archived_at: null,
  };

  database.projects.unshift(project);
  writeDemoDatabase(database);
  return project;
};

export const getDemoProjectsForUser = (userId: string) =>
  readDemoDatabase().projects.filter((project) => project.user_id === userId);

export const getDemoProjectById = (projectId: string) =>
  readDemoDatabase().projects.find((project) => project.id === projectId) ?? null;

export const updateDemoProjectRecord = (
  projectId: string,
  updates: Partial<Omit<DemoProjectRecord, "id" | "user_id" | "created_at">>,
) => {
  const database = readDemoDatabase();
  const projectIndex = database.projects.findIndex((project) => project.id === projectId);
  if (projectIndex === -1) return null;

  const nextProject: DemoProjectRecord = {
    ...database.projects[projectIndex],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  database.projects[projectIndex] = nextProject;
  writeDemoDatabase(database);
  return nextProject;
};

export const deleteDemoProjectRecord = (projectId: string) => {
  const database = readDemoDatabase();
  database.projects = database.projects.filter((project) => project.id !== projectId);
  database.participants = database.participants.filter((participant) => participant.project_id !== projectId);
  database.sessions = database.sessions.filter((session) => session.project_id !== projectId);
  writeDemoDatabase(database);
};

export const createDemoParticipantRecord = (
  participant: Omit<DemoParticipantRecord, "id" | "created_at" | "updated_at" | "invitation_token">,
) => {
  const database = readDemoDatabase();
  const timestamp = new Date().toISOString();
  const nextParticipant: DemoParticipantRecord = {
    ...participant,
    id: createId("mock-participant-"),
    invitation_token: createId("mock-invite-"),
    created_at: timestamp,
    updated_at: timestamp,
    invited_at: participant.invited_at ?? timestamp,
  };

  database.participants.unshift(nextParticipant);
  writeDemoDatabase(database);
  return nextParticipant;
};

export const getDemoParticipantsForProject = (projectId: string) =>
  readDemoDatabase().participants.filter((participant) => participant.project_id === projectId);

export const getDemoParticipantByToken = (token: string) =>
  readDemoDatabase().participants.find((participant) => participant.invitation_token === token) ?? null;

export const updateDemoParticipantRecord = (
  participantId: string,
  updates: Partial<Omit<DemoParticipantRecord, "id" | "project_id" | "email" | "invitation_token" | "created_at">>,
) => {
  const database = readDemoDatabase();
  const participantIndex = database.participants.findIndex((participant) => participant.id === participantId);
  if (participantIndex === -1) return null;

  const nextParticipant: DemoParticipantRecord = {
    ...database.participants[participantIndex],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  database.participants[participantIndex] = nextParticipant;
  writeDemoDatabase(database);
  return nextParticipant;
};

export const updateDemoParticipantByToken = (
  token: string,
  updates: Partial<Omit<DemoParticipantRecord, "id" | "project_id" | "email" | "invitation_token" | "created_at">>,
) => {
  const participant = getDemoParticipantByToken(token);
  if (!participant?.id) return null;
  return updateDemoParticipantRecord(participant.id, updates);
};

export const deleteDemoParticipantRecord = (participantId: string) => {
  const database = readDemoDatabase();
  database.participants = database.participants.filter((participant) => participant.id !== participantId);
  database.sessions = database.sessions.filter((session) => session.participant_id !== participantId);
  writeDemoDatabase(database);
};

export const createDemoSessionRecord = (
  session: Omit<DemoSessionRecord, "id" | "created_at" | "updated_at" | "session_token">,
) => {
  const database = readDemoDatabase();
  const timestamp = new Date().toISOString();
  const nextSession: DemoSessionRecord = {
    ...session,
    id: createId("mock-session-id-"),
    session_token: createId("mock-session-"),
    created_at: timestamp,
    updated_at: timestamp,
  };

  database.sessions.unshift(nextSession);
  writeDemoDatabase(database);
  return nextSession;
};

export const getDemoSessionByToken = (token: string) =>
  readDemoDatabase().sessions.find((session) => session.session_token === token) ?? null;

export const getDemoSessionsForProject = (projectId: string) =>
  readDemoDatabase().sessions.filter((session) => session.project_id === projectId);

export const getDemoProjectForSessionToken = (token: string) => {
  const session = getDemoSessionByToken(token);
  if (!session) return null;
  return getDemoProjectById(session.project_id);
};
