export function windowsSubsystem(binary: Buffer): number
export function checkWindowsExecutable(executable: string): Promise<{ subsystem: number; startupExitCode: number }>
