import { exec } from 'child_process'
import { promisify } from 'util'

type ExecFunction = (command: string, options: Object) => Promise<{stdout: string, stderr: string}>
export const promiseExec: ExecFunction = promisify(exec)