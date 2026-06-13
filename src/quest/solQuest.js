import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { BaseQuest } from './baseQuest.js';
import { mainPath, readSettings } from '../utils/navigation.js';
import { checkForgeVersion } from '../utils/versions.js';

let hreInstance = null;

const DIRECTORY_PATH = path.join(
    mainPath(),
    'campaigns/directory.json'
);

export class SolidityQuest extends BaseQuest {

    static find(questName) {
        try {
            const campaigns = readJsonFile(DIRECTORY_PATH);

            const foundCampaign = campaigns.find(campaign =>
                campaign.quests?.some(quest => quest.name === questName)
            );

            if (!foundCampaign) {
                return null;
            }

            const foundQuest = foundCampaign.quests.find(
                quest => quest.name === questName
            );

            return new SolidityQuest(
                foundCampaign.name,
                foundQuest
            );

        } catch (error) {
            console.error(
                chalk.red(`Failed to find quest: ${error.message}`)
            );

            return null;
        }
    }

    constructor(campaignName, questInfo) {

        const framework = readSettings()?.framework;

        const runTests = framework === 'foundry'
            ? runFoundryTests
            : runHardhatTests;

        super(
            'solidity',
            campaignName,
            questInfo,
            runTests
        );

        // TODO:
        // Remove this after migration to ng-solidity-quests-public
        this.fromRepository = 'ng-quests-public';
    }

    localVersion() {

        const packageJsonPath = path.join(
            this.localPath(),
            'package.json'
        );

        if (!fs.existsSync(packageJsonPath)) {
            return null;
        }

        try {
            const packageData = readJsonFile(packageJsonPath);
            return packageData.version ?? null;

        } catch (error) {
            console.error(
                chalk.red(
                    `Failed to read local version: ${error.message}`
                )
            );

            return null;
        }
    }
}

function readJsonFile(filePath) {
    return JSON.parse(
        fs.readFileSync(filePath, 'utf-8')
    );
}

async function getHardhatRuntime() {

    if (!hreInstance) {
        const imported = await import('hardhat');
        hreInstance = imported.default;
    }

    return hreInstance;
}

async function runHardhatTests(partIndex) {

    try {

        const hre = await getHardhatRuntime();

        console.log(
            chalk.cyan(`Running Hardhat tests for Part ${partIndex}...\n`)
        );

        await hre.run('test', {
            grep: `Part ${partIndex}`
        });

    } catch (error) {

        console.error(
            chalk.red(`Hardhat tests failed:\n${error.message}`)
        );

        process.exit(1);
    }
}

async function runFoundryTests(partIndex) {

    console.log();

    if (!checkForgeVersion()) {
        process.exit(1);
    }

    console.log(
        chalk.cyan(`Running Foundry tests for Part ${partIndex}...\n`)
    );

    const forgeParams = [
        'test',
        '--match-path',
        `*.${partIndex}.t.sol`
    ];

    const result = spawnSync(
        'forge',
        forgeParams,
        {
            stdio: 'inherit',
            shell: true
        }
    );

    if (result.error) {

        console.error(
            chalk.red(`Failed to run forge:\n${result.error.message}`)
        );

        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status);
    }

    console.log();
}
