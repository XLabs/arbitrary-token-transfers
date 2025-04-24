import { runTypeChainInMemory, FileDescription, PublicInMemoryConfig } from '@xlabs-xyz/typechain';
import ethersv6Codegen from "@xlabs-xyz/typechain-ethers-v6";
import { readFile } from 'fs/promises';
import { normalize, join, sep } from 'path';

(async () => {

    if (process.argv.length < 4) {
        console.log('Generate Typechain bindings from Solc output');
        console.log(`\nsolc2bindings <outDir> <inputFile1> [inputFile2] [inputFile3]...`);
        process.exit(1);
    }

    const outDir = process.argv[2];
    const inputFiles = process.argv.slice(3);
    const fileDescriptions: FileDescription[] = [];

    // TODO: If a contract is duplicated in the outputs, Typechain will generate
    // duplicate identifiers. this should be handled better somewhere.
    // Maybe here, maybe in the Typechain API.
    for (const inputFile of inputFiles) {
        const data = await readFile(inputFile, null);
        const json = JSON.parse(data.toString());
        const contracts: any = json['contracts'];

        console.log(`Found ${Object.keys(contracts).length} entries to process in file ${inputFile}...`);

        for (const [path, contents] of Object.entries(contracts)) {
            const contractsInFile = Object.entries(contents as { [key: string]: any });
            console.log(`  Found path ${path} with ${contractsInFile.length} contracts`);
            const pathSegments = normalize(path).split(sep);

            if (pathSegments.length > 0 && pathSegments[0] === "..") {
                console.log(`  Ignoring path ${path} due to being outside the project directory`);
                continue;
            }

            for (const [contractName, abiAndBytecodeData] of contractsInFile) {
                console.log(`    Adding contract ${contractName}`);
                fileDescriptions.push({ path, contents: JSON.stringify(abiAndBytecodeData) });
            }
        }
    }

    const pc = {
        cwd: join(process.cwd()),
        allFiles: fileDescriptions.map(k => k.contents),
        outDir,
        flags: {
            alwaysGenerateOverloads: false,
            discriminateTypes: false,
            node16Modules: true,
            environment: undefined,
        }
    } satisfies PublicInMemoryConfig;

    const result = await runTypeChainInMemory(pc, fileDescriptions, ethersv6Codegen);

    console.log(`Generated ${result.filesGenerated} file(s)`);
})()


