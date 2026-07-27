import { api } from '../../api/api';

export type ProjectNodeType = 'PHASE' | 'TASK' | 'SUBTASK';
export type Rag = 'GREEN' | 'AMBER' | 'RED';

export interface PortfolioRow {
  projectId: string;
  name: string;
  siteId: string | null;
  status: string;
  percentComplete: number;
  plannedPercent: number;
  actualPercent: number;
  variancePercent: number;
  daysAheadBehind: number | null;
  rag: Rag;
  slip: boolean;
}

export interface ProjectHealth {
  projectId: string;
  name: string;
  siteId: string | null;
  status: string;
  plannedPercent: number;
  actualPercent: number;
  variancePercent: number;
  daysAheadBehind: number | null;
  rag: Rag;
  slip: boolean;
}

export interface ProjectNodeRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  type: ProjectNodeType;
  title: string;
  ownerUserId: string | null;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  percentComplete: string;
  weight: string;
  position: number;
}

export interface ProjectRecord {
  id: string;
  entityId: string | null;
  name: string;
  description: string | null;
  siteId: string | null;
  contractId: string | null;
  orderId: string | null;
  ownerUserId: string | null;
  status: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  percentComplete: string;
  createdAt: string;
}

export interface ProjectDetail extends ProjectRecord {
  nodes: ProjectNodeRecord[];
}

export interface WbsTemplateRecord {
  id: string;
  entityId: string | null;
  name: string;
  jobType: string | null;
  structure: unknown;
  createdAt: string;
}

export interface CreateProjectBody {
  name: string;
  description?: string;
  siteId?: string;
  status?: string;
  plannedStart?: string;
  plannedFinish?: string;
}

export interface CreateNodeBody {
  type: ProjectNodeType;
  title: string;
  parentId?: string;
  weight?: number;
  plannedStart?: string;
  plannedFinish?: string;
}

export interface UpdateProgressBody {
  percentComplete?: number;
  note?: string;
  complete?: boolean;
}

export interface FromTemplateBody {
  name: string;
  description?: string;
  siteId?: string;
}

// NOTE: this feature does not register its own tagTypes (api.ts is owned by the
// integration agent). Instead each mutation returns the refreshed resource and the
// page triggers manual `refetch()` on the relevant queries, so no cross-query tag
// wiring is required.
export const projectsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getPortfolio: build.query<PortfolioRow[], void>({
      query: () => 'v1/projects/portfolio',
    }),
    getProject: build.query<ProjectDetail, string>({
      query: (id) => `v1/projects/${id}`,
    }),
    getProjectHealth: build.query<ProjectHealth, string>({
      query: (id) => `v1/projects/${id}/health`,
    }),
    createProject: build.mutation<ProjectRecord, CreateProjectBody>({
      query: (body) => ({ url: 'v1/projects', method: 'POST', body }),
    }),
    addProjectNode: build.mutation<
      ProjectNodeRecord,
      { projectId: string } & CreateNodeBody
    >({
      query: ({ projectId, ...body }) => ({
        url: `v1/projects/${projectId}/nodes`,
        method: 'POST',
        body,
      }),
    }),
    updateNodeProgress: build.mutation<
      ProjectDetail,
      { projectId: string; nodeId: string } & UpdateProgressBody
    >({
      query: ({ projectId, nodeId, ...body }) => ({
        url: `v1/projects/${projectId}/nodes/${nodeId}/progress`,
        method: 'PATCH',
        body,
      }),
    }),
    getTemplates: build.query<WbsTemplateRecord[], void>({
      query: () => 'v1/projects/templates',
    }),
    createProjectFromTemplate: build.mutation<
      ProjectDetail,
      { templateId: string } & FromTemplateBody
    >({
      query: ({ templateId, ...body }) => ({
        url: `v1/projects/from-template/${templateId}`,
        method: 'POST',
        body,
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetPortfolioQuery,
  useGetProjectQuery,
  useGetProjectHealthQuery,
  useCreateProjectMutation,
  useAddProjectNodeMutation,
  useUpdateNodeProgressMutation,
  useGetTemplatesQuery,
  useCreateProjectFromTemplateMutation,
} = projectsApi;
