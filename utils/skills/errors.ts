type SkillErrorDetails = {
  message: string
  details: string
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: cause instanceof Error
        ? {
            name: cause.name,
            message: cause.message,
            stack: cause.stack,
          }
        : cause,
    }
  }
  if (typeof error === 'object' && error) {
    const record = error as { message?: unknown }
    const message = typeof record.message === 'string' ? record.message : undefined
    return { message, ...record }
  }
  return { message: String(error) }
}

export function formatSkillError(error: unknown): SkillErrorDetails {
  const serialized = serializeError(error)
  const serializedJson = JSON.stringify(serialized)
  const message = (() => {
    if (serialized && typeof serialized === 'object' && 'message' in serialized) {
      const value = (serialized as { message?: unknown }).message
      if (typeof value === 'string' && value.trim()) return value
    }
    if (typeof error === 'string' && error.trim()) return error
    return 'Skill run failed'
  })()
  const detailsObject = serializedJson === '{}'
    ? {
        message,
        type: Object.prototype.toString.call(error),
        keys: error && typeof error === 'object' ? Object.getOwnPropertyNames(error as object) : [],
        string: String(error),
      }
    : serialized
  return {
    message,
    details: JSON.stringify(detailsObject, null, 2),
  }
}
