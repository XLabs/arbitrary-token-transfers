import { runTypeChainInMemory, PublicConfig, FileDescription } from '@xlabs-xyz/typechain';
import { readFile } from 'fs/promises';
import path from 'path';
import { exit } from 'process';

(async () => {

    if (process.argv.length < 4) {
        console.log('Generate Typechain bindings from Solc output')
        console.log(`\nsolc2bindings <inputFile> <outDir>`)
        exit(1)
    }

    const outDir = process.argv[3];
    const inputFile = process.argv[2];

    const data = await readFile(inputFile, null)
    const json = JSON.parse(data.toString())
    const contracts: any = json['contracts']
    const fileDescriptions: FileDescription[] = []

    console.log(`Found ${Object.keys(contracts).length} entries to process...`)
    
    for (const [path, contents] of Object.entries(contracts)) {
        const contractsInFile = Object.entries(contents as { [key: string]: any });
        console.log(`  Found path ${path} with ${contractsInFile.length} contracts `)
        for (const [contractName, abiAndBytecodeData] of contractsInFile) {
            console.log(`    Adding contract ${contractName} `)
            fileDescriptions.push({ path, contents: JSON.stringify(abiAndBytecodeData) });
        }
    }
    
    const pc: Omit<PublicConfig, "filesToProcess"> = {
        cwd: path.join(process.cwd()),
        allFiles: fileDescriptions.map(k => k.contents),
        target: 'ethers-v6',
        outDir
    }

    const result = await runTypeChainInMemory(pc, fileDescriptions)

    console.log(`Generated ${result.filesGenerated} file(s)`)
})()


