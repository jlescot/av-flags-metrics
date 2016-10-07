var _ = require("lodash");
var AWS = require("aws-sdk");
var BPromise = require("bluebird");


// Dashboard - widget metrics: Number of widgets per user (https://issues.sierrawireless.com/browse/PLTFRS-5284)
// Dashboard - widget metrics: Widget deployment rate (https://issues.sierrawireless.com/browse/PLTFRS-5285)
// 
// Compute the average # of widgets deployed as well as the deployment rate for each of the current widgets available in the start page dashboard for users and a given offer.
// 

//--------------------------------
// Here starts the magic script !!
// 

var SUPPORTED_TARGET_ENVS = ["LOCAL", "qa", "dev1", "na", "eu"];
var SUPPORTED_COMMANDS = ["listAVCCompanies", "listUserFlagsForCompany", "migrateUserFlags", "migrateAllUserFlagsForCompany", "migrateAllUserFlagsForAllAVCCompanies", "listAirLinkCompanies", "migrateDataIdsFromMSCIToLWM2M", "startPageMetrics"];

// Check that the user has entered a valid target environment
if (process.argv.length > 2 && _.includes(SUPPORTED_TARGET_ENVS, process.argv[2])) {
    var targetEnv = process.argv[2];

    // AWS credentials (accessKeyId / secretAccessKey) are retrieved from the `~/.aws/credentials` file
    // where we consider that two profiles are created: 'prod' and 'preprod'
    if (targetEnv === "LOCAL") {
        AWS.config.update({
            region: "local",
            endpoint: "http://dynamodb:9000"
        });
    } else {
        AWS.config.credentials = new AWS.SharedIniFileCredentials({
            profile: _.includes(["na", "eu"], targetEnv) ? "prod" : "preprod"
        });
        AWS.config.update({
            region: targetEnv === "na" ? "us-west-2" : "eu-west-1"
        });
    }

    var docClient = new AWS.DynamoDB.DocumentClient();



    // Launch all the magic !!

    if (process.argv.length > 3 && process.argv[3] === "listAVCCompanies") {
        var flagsHelper = require("./lib/flagsHelper")(targetEnv, docClient);
        flagsHelper.getCompaniesUsingCompanyProfile("AVC").then(function(companyIdentifiers) {
            console.log("\033[1mAll AVC Company identifiers\033[0m");
            console.log(companyIdentifiers.join("\n"));
        });
    } else if (process.argv.length > 4 && process.argv[3] === "listUserFlagsForCompany") {
        var migrateAVCUserFlags = require("./commands/migrateAVCUserFlags")(targetEnv, docClient);
        migrateAVCUserFlags.getAllUserFlagsForCompany(process.argv[4]).then(function(userAndCompanyFlagsIdentifier) {
            console.log("\033[1mAll UserFlags\033[0m");
            console.log(userAndCompanyFlagsIdentifier.join("\n"));
        });
    } else if (process.argv.length > 4 && process.argv[3] === "migrateUserFlags") {
        var migrateAVCUserFlags = require("./commands/migrateAVCUserFlags")(targetEnv, docClient);
        migrateAVCUserFlags.migrateFor(process.argv[4]);
    } else if (process.argv[3] === "migrateAllUserFlagsForCompany") {
        // Given an AVC Company identifier, migrate all the UserFlags that belong to it
        var migrateAVCUserFlags = require("./commands/migrateAVCUserFlags")(targetEnv, docClient);
        return migrateAVCUserFlags.getAllUserFlagsForCompany(process.argv[4]).then(function(userAndCompanyFlagsIdentifiers) {
            return BPromise.each(userAndCompanyFlagsIdentifiers, function(userAndCompanyFlagsIdentifier) {
                return migrateAVCUserFlags.migrateFor(userAndCompanyFlagsIdentifier);
            });
        });
    } else if (process.argv[3] === "migrateAllUserFlagsForAllAVCCompanies") {
        // /!\ This will migrate all UserFlags for all Companies that are considered as AVC
        var flagsHelper = require("./lib/flagsHelper")(targetEnv, docClient);
        var migrateAVCUserFlags = require("./commands/migrateAVCUserFlags")(targetEnv, docClient);

        flagsHelper.getCompaniesUsingCompanyProfile("AVC").then(function(companyIdentifiers) {
            return BPromise.each(companyIdentifiers, function(companyId) {
                return migrateAVCUserFlags.getAllUserFlagsForCompany(companyId).then(function(userAndCompanyFlagsIdentifiers) {
                    return BPromise.each(userAndCompanyFlagsIdentifiers, function(userAndCompanyFlagsIdentifier) {
                        return migrateAVCUserFlags.migrateFor(userAndCompanyFlagsIdentifier);
                    });
                });
            });
        });

        //************************************************************************
        // PLTFRS-5774 [LWM2M Transition] Migrate Charts based on Data identifiers
    } else if (process.argv.length > 3 && process.argv[3] === "listAirLinkCompanies") {
        var migrateToLWM2M = require("./commands/migrateToLWM2M")(targetEnv, docClient);
        migrateToLWM2M.listAirLinkCompanies().then(function(companyIdentifiers) {
            console.log("\033[1mAll AirLink Company identifiers\033[0m");
            console.log(companyIdentifiers.join("\n"));
        });
    } else if (process.argv.length > 3 && process.argv[3] === "migrateDataIdsFromMSCIToLWM2M") {
        // /!\ This will migrate all UserFlags for all Companies that are considered as AirLink
        var migrateToLWM2M = require("./commands/migrateToLWM2M")(targetEnv, docClient);

        migrateToLWM2M.listAirLinkCompanies().then(function(companyIdentifiers) {
            return BPromise.each(companyIdentifiers, function(companyId) {
                return migrateToLWM2M.getAllUserFlagsForCompany(companyId).then(function(userAndCompanyFlagsIdentifiers) {
                    return BPromise.each(userAndCompanyFlagsIdentifiers, function(userAndCompanyFlagsIdentifier) {
                        return migrateToLWM2M.migrateFor(userAndCompanyFlagsIdentifier);
                    });
                });
            });
        });


        //**************************
        // Other utilities functions
    } else if (process.argv.length > 3 && process.argv[3] === "startPageMetrics") {
        // $ node index qa startPageMetrics
        require("./commands/startPageMetrics")(targetEnv, docClient).execute();
    } else if (process.argv.length > 3 && process.argv[3] === "dumpUserFlags") {
        // Launch with the following command (all UserFlags details will be written in the given file)
        // $ node index qa dumpUserFlags > qa_Flags.json
        // Launch with the following command to list only UserFlags for a given Company identifier
        // $ node index qa dumpUserFlags cb007f525a3a4bd1ba0756abfcab8a1d > qa_IotPlatformDemo_Flags.json
        require("./commands/dumpUserFlags")(targetEnv, docClient).execute(process.argv[4]);
    } else {
        console.error("\033[1m\033[31mYou need to specify a valid command.\n\033[33mSupported commands are", SUPPORTED_COMMANDS, "\033[0m");
    }
} else {
    console.error("\033[1m\033[31mYou must specify the target environment.\n\033[33mSupported values are", SUPPORTED_TARGET_ENVS, "\033[0m");
    process.exit(1);
}
