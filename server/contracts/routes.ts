import { expectRecord, readString, readJsonBody, validatePath } from '../lib/validation.ts'

export type LoginRequest = { apiKey: string }
export type CreateProjectRequest = {
  name: string
  description?: string
  template?: string
  defaultModel?: string
}
export type PatchProjectRequest = { defaultModel: string }

export type ChatSendRequest = {
  projectId: string
  model?: string
  prompt: string
  sessionId?: string
  agentUrl?: string
}

export type ChatControlRequest = {
  projectId: string
  sessionId: string
}

export type ContinuationEnactRequest = {
  sourceProjectId: string
}

export type FilesWriteRequest = {
  projectId: string
  path: string
  content: string
}

export type FilesPathRequest = {
  projectId: string
  path: string
}

export type FilesRenameRequest = {
  projectId: string
  from: string
  to: string
}

export async function parseLoginRequest(raw: unknown): Promise<LoginRequest> {
  const body = expectRecord(raw)
  const apiKey = readString(body, 'apiKey', { required: true, minLength: 3 })
  return { apiKey: apiKey! }
}

export async function parseCreateProjectRequest(raw: unknown): Promise<CreateProjectRequest> {
  const body = expectRecord(raw)

  const name = readString(body, 'name', { required: true, minLength: 1 })
  const description = readString(body, 'description')
  const template = readString(body, 'template')
  const defaultModel = readString(body, 'defaultModel')

  return {
    name: name!,
    description,
    template,
    defaultModel,
  }
}

export async function parsePatchProjectRequest(raw: unknown): Promise<PatchProjectRequest> {
  const body = expectRecord(raw)
  const defaultModel = readString(body, 'defaultModel', { required: true, minLength: 1 })
  return { defaultModel: defaultModel! }
}

export async function parseChatSendRequest(raw: unknown): Promise<ChatSendRequest> {
  const body = expectRecord(raw)

  const projectId = readString(body, 'projectId', { required: true, minLength: 1 })
  const prompt = readString(body, 'prompt', { required: true, minLength: 1 })
  const model = readString(body, 'model')
  const sessionId = readString(body, 'sessionId')
  const agentUrl = readString(body, 'agentUrl')

  return {
    projectId: projectId!,
    prompt: prompt!,
    model,
    sessionId,
    agentUrl,
  }
}

export async function parseChatControlRequest(raw: unknown): Promise<ChatControlRequest> {
  const body = expectRecord(raw)

  const projectId = readString(body, 'projectId', { required: true, minLength: 1 })
  const sessionId = readString(body, 'sessionId', { required: true, minLength: 1 })

  return {
    projectId: projectId!,
    sessionId: sessionId!,
  }
}

export async function parseContinuationEnactRequest(raw: unknown): Promise<ContinuationEnactRequest> {
  const body = expectRecord(raw)
  const sourceProjectId = readString(body, 'sourceProjectId', { required: true, minLength: 1 })
  return { sourceProjectId: sourceProjectId! }
}

export async function parseFilesWriteRequest(raw: unknown): Promise<FilesWriteRequest> {
  const body = expectRecord(raw)
  const projectId = readString(body, 'projectId', { required: true, minLength: 1 })
  const path = readString(body, 'path', { required: true, minLength: 1 })
  const content = readString(body, 'content', { required: true, minLength: 0, trim: false })

  return {
    projectId: projectId!,
    path: validatePath(path!, 'path'),
    content: content ?? '',
  }
}

export async function parseFilesPathRequest(raw: unknown): Promise<FilesPathRequest> {
  const body = expectRecord(raw)
  const projectId = readString(body, 'projectId', { required: true, minLength: 1 })
  const path = readString(body, 'path', { required: true, minLength: 1 })

  return {
    projectId: projectId!,
    path: validatePath(path!, 'path'),
  }
}

export async function parseFilesRenameRequest(raw: unknown): Promise<FilesRenameRequest> {
  const body = expectRecord(raw)
  const projectId = readString(body, 'projectId', { required: true, minLength: 1 })
  const from = readString(body, 'from', { required: true, minLength: 1 })
  const to = readString(body, 'to', { required: true, minLength: 1 })

  return {
    projectId: projectId!,
    from: validatePath(from!, 'from'),
    to: validatePath(to!, 'to'),
  }
}

export async function readAndParseJSON<T>(rawBodyPromise: Promise<unknown>, parser: (input: unknown) => Promise<T>) {
  const body = await rawBodyPromise
  return parser(body)
}

export async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return readJsonBody(c as any)
}
