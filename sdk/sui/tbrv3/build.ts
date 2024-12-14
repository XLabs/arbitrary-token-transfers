import { promiseExec } from "./utils.js"

export async function runOnDirectory(command: string, directory: string): Promise<{stdout: string, stderr: string}> {
    return promiseExec(command, { cwd: directory })
}

export async function buildSuiContract(directory: string): Promise<{modules: string[], dependencies: string[], stderr: string}> {
    const result = await runOnDirectory("sui move build --dump-bytecode-as-base64", directory)
    const { modules, dependencies } = JSON.parse(result.stdout)
    return { modules, dependencies, stderr: result.stderr }
}