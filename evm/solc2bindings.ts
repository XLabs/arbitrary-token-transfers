import { runTypeChainInMemory, FileDescription } from '@xlabs-xyz/typechain';
import ethersv6Codegen from "@xlabs-xyz/typechain-ethers-v6";
import { readFile } from 'fs/promises';
import path from 'path';

(async () => {

    if (process.argv.length < 4) {
        console.log('Generate Typechain bindings from Solc output');
        console.log(`\nsolc2bindings <inputFile> <outDir>`);
        process.exit(1);
    }

    const outDir = process.argv[3];
    const inputFile = process.argv[2];

    const data = await readFile(inputFile, null);
    const json = JSON.parse(data.toString());
    const contracts: any = json['contracts'];
    const fileDescriptions: FileDescription[] = [];

    console.log(`Found ${Object.keys(contracts).length} entries to process...`);

    for (const [path, contents] of Object.entries(contracts)) {
        const contractsInFile = Object.entries(contents as { [key: string]: any });
        console.log(`  Found path ${path} with ${contractsInFile.length} contracts `);
        for (const [contractName, abiAndBytecodeData] of contractsInFile) {
            console.log(`    Adding contract ${contractName} `);
            fileDescriptions.push({ path, contents: JSON.stringify(abiAndBytecodeData) });
        }
    }

    const pc = {
        cwd: path.join(process.cwd()),
        allFiles: fileDescriptions.map(k => k.contents),
        outDir
    };

    const result = await runTypeChainInMemory(pc, fileDescriptions, ethersv6Codegen);

    console.log(`Generated ${result.filesGenerated} file(s)`);
})()


