type SkillPermissionRequest = {
  name: string
  allowedTools: string
}

let handler: ((request: SkillPermissionRequest) => Promise<boolean>) | null = null

export function registerSkillPermissionHandler(nextHandler: (request: SkillPermissionRequest) => Promise<boolean>) {
  handler = nextHandler
  return () => {
    if (handler === nextHandler) {
      handler = null
    }
  }
}

export async function requestSkillPermission(request: SkillPermissionRequest): Promise<boolean> {
  if (!handler) return false
  return handler(request)
}
