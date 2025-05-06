import { runTypeChainInMemory, FileDescription, PublicInMemoryConfig } from '@xlabs-xyz/typechain';
import ethersv6Codegen from "@xlabs-xyz/typechain-ethers-v6";
import { readFile } from 'fs/promises';
import { normalize, join, sep, parse } from 'path';

(async () => {

    if (process.argv.length < 4) {
        console.log('Generate Typechain bindings from Solc output');
        console.log(`\nsolc2bindings <outDir> <inputFile1>;<contractName1> [inputFile2;contractName2] [inputFile3;contractName3]...`);
        process.exit(1);
    }

    const outDir = process.argv[2];
    const fileDescriptions: FileDescription[] = [];

    const inputFiles = [] as string[];
    const contractNames = [] as string[];
    const fileAndContracts = process.argv.slice(3);
    for (const fileAndContract of fileAndContracts) {
        // We're going to assume we only care about the main contract in each file
        // Note that doing this eliminates types for many things, but since we are already
        // doing our own argument serialization, we don't really need any of them.
        // TODO: allow customization with some compact specification format
        const [inputFile, contractName] = fileAndContract.split(":");
        inputFiles.push(inputFile);
        contractNames.push(contractName);
    }

    // TODO: If a contract is duplicated in the outputs, Typechain will generate
    // duplicate identifiers. this should be handled better somewhere.
    // Maybe here, maybe in the Typechain API.
    for (const inputFile of inputFiles) {
        const data = await readFile(inputFile, "utf8");
        const json = JSON.parse(data);
        const contracts: any = json['contracts'];

        console.log(`Found ${Object.keys(contracts).length} entries to process in file ${inputFile}...`);

        for (const [path, contents] of Object.entries(contracts)) {
            const contractsInFile = Object.entries(contents as { [key: string]: any });
            console.log(`  Found path ${path} with ${contractsInFile.length} contracts`);
            const normalizedPath = normalize(path)
            const pathSegments = normalizedPath.split(sep);
            const pathComponents = parse(normalizedPath);
            // TODO: the comparison here is actually fishy, maybe we need to look at the contents instead.
            if (!contractNames.includes(pathComponents.name)) {
                console.log(`    Discarded contract ${pathComponents.name}`);
                continue;
            }

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
})().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
})


