var _ = require("lodash");
var AWS = require("aws-sdk");
var BPromise = require("bluebird");

var Ora = require("ora");


function getAllCompanyProfilesReferenced(flagsHelper) {
    const spinner = new Ora({
        color: "yellow"
    });
    spinner.start();

    spinner.text = "Step 1/2 - Retrieving alls CompanyProfiles referenced by Companies...";
    return flagsHelper.getAllCompanyProfilesReferenced().then(function(companies) {

        spinner.text = "Step 2/2 - Computing results...";
        var sortedResult = _.chain(companies.Items)
            .countBy("profileName")
            .toPairs()
            .sortBy(function(item) {
                return -item[1];
            })
            .map(function(item) {
                return item[1] + "\t: " + item[0].replace(/\"/g, "");
            })
            .value();

        spinner.stop();
        console.log("\n************************************************************************");
        console.log("\033[1mCompanyProfiles in use:\033[0m\n -", sortedResult.join("\n - "));
        console.log("************************************************************************");
        return BPromise.resolve();

    });
}

// Dashboard - widget metrics: Number of widgets per user (https://issues.sierrawireless.com/browse/PLTFRS-5284)
// Dashboard - widget metrics: Widget deployment rate (https://issues.sierrawireless.com/browse/PLTFRS-5285)
// 
// Compute the average # of widgets deployed as well as the deployment rate for each of the current widgets available in the start page dashboard for users and a given offer.
// 
function getDashboardMetrics(flagsHelper, accountType) {
    var spinner = new Ora({
        color: "yellow"
    });
    spinner.start();

    spinner.text = "Step 1/4 - Retrieving '" + accountType + "' CompanyProfile...";
    return flagsHelper.getCompanyProfileContents(accountType).then(function(contents) {
        if (contents.Items.length === 0) {
            console.error("\033[1m\033[31mUnable to find the '" + accountType + "' CompanyProfile! Please contact the R&D team.");
            spinner.stop();
            process.exit(1);
        }
        var defaultDashboardConfiguration = JSON.parse(contents.Items[0].startDashboard_widgetsOrder);

        spinner.text = "Step 2/4 - Retrieving Companies using the '" + accountType + "' CompanyProfile...";
        return flagsHelper.getCompaniesUsingCompanyProfile(accountType).then(function(companies) {
            var relevantCompanies = _.map(companies.Items, "CompanyUid");

            spinner.text = "Step 3/4 - Retrieving all UserFlags with the key 'startDashboard_widgetsOrder'...";
            return flagsHelper.getAllUserFlagsWithKey("startDashboard_widgetsOrder").then(function(userFlags) {

                spinner.text = "Step 4/4 - Computing results...";
                // Filter only UserFlags that are associated to the given CompanyProfile
                var relevantUserFlags = _.filter(userFlags.Items, function(flags) {
                    var userAndCompanyInfo = flags.UserAndCompanyUid.split("_");
                    return userAndCompanyInfo.length === 2 && _.includes(relevantCompanies, userAndCompanyInfo[1]);
                });

                // Rework the 'rough' list of UserFlags so that for each user, we got the list of widget identifiers only.
                // The result would be an array like the following:
                // [ [ "offerIntro", "register", "alertRules", "commStatusMap" ],
                //   [ "register", "alertRules", "userDocumentation", "commStatus", "commStatusMap" ],
                //   [ "offerIntro", "register", "alertRules", "serviceType", "commStatusMap" ],
                //   [ "register", "alertRules", "userDocumentation", "commStatus" ],
                //   [ "offerIntro", "systemType", "signalStrength", "serviceType", "commStatusMap" ],
                //   [ "monitor", "alerts", "userDocumentation", "developerDocumentation", "commStatus" ] ]
                var parsedFlags = _.map(relevantUserFlags, function(flags) {
                    // Since the value is stored as String, we first need to parse it as a JSON object
                    var jsonValue = JSON.parse(flags.startDashboard_widgetsOrder);
                    // The 'startDashboard_widgetsOrder' flag contents is an array composed of:
                    // - String: in this case, we immediately get the list of widgets identifier
                    // - Object: in this case, the widget identifier is stored in the 'widgetType' property
                    return _.map(jsonValue, function(value) {
                        return value.widgetType || value;
                    });
                });

                // We should then ignore UserFlags with the exact same configuration (same widgets, ordered the same way) as defined in the given CompanyProfile
                var customizedDashboards = _.reject(parsedFlags, function(flags) {
                    return _.isEqual(flags, defaultDashboardConfiguration);
                });

                // We can 'easily' count the number of widgets available for each 'startDashboard_widgetsOrder' flag
                var countByNbWidgets = _.chain(customizedDashboards)
                    .countBy("length")
                    .toPairs()
                    .sortBy(function(item) {
                        return -item[1];
                    })
                    .map(function(item) {
                        return item[1] + "\t: " + item[0].replace(/\"/g, "") + " widget(s)";
                    })
                    .value();

                // We can also 'easily' count the number of occurrences a widget is displayed in the dashboard
                var countByWidgetType = _.chain(customizedDashboards)
                    .flattenDeep()
                    .countBy()
                    .toPairs()
                    .sortBy(function(item) {
                        return -item[1];
                    })
                    .map(function(item) {
                        return item[1] + "\t: " + item[0].replace(/\"/g, "");
                    })
                    .value();

                spinner.stop();
                console.log("\n************************************************************************");
                console.log("\033[1mSUMMARY for", targetEnv.toUpperCase(), "environment\033[0m");
                console.log("\n");
                console.log("- Number of Companies using the '" + accountType + "' CompanyProfile          :", companies.Items.length);
                console.log("- Number of UserFlags with the flag 'startDashboard_widgetsOrder' :", userFlags.Items.length);
                console.log("- Number of UserFlags associated to an '" + accountType + "' CompanyProfile   :", relevantUserFlags.length, "(and only\033[1m", customizedDashboards.length, "\033[0mare different from the default configuration)");
                console.log("\n");
                console.log("\033[1m- Number of widgets per " + accountType + " user:\033[0m\n   -", countByNbWidgets.join("\n   - "));
                console.log("\n");
                console.log("\033[1m- Widget deployment rate:\033[0m\n   -", countByWidgetType.join("\n   - "));
                console.log("************************************************************************");

                return BPromise.resolve();
            });
        });
    });
}

//--------------------------------
// Here starts the magic script !!
// 

var SUPPORTED_TARGET_ENVS = ["LOCAL", "qa", "dev1", "na", "eu"];

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
        var migrateAVCUserFlags = require("./commands/migrateAVCUserFlags")(targetEnv, docClient);
        migrateAVCUserFlags.listAVCCompanies().then(function(companyIdentifiers) {
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
        var migrateAVCUserFlags = require("./commands/migrateAVCUserFlags")(targetEnv, docClient);

        migrateAVCUserFlags.listAVCCompanies().then(function(companyIdentifiers) {
            return BPromise.each(companyIdentifiers, function(companyId) {
                return migrateAVCUserFlags.getAllUserFlagsForCompany(companyId).then(function(userAndCompanyFlagsIdentifiers) {
                    return BPromise.each(userAndCompanyFlagsIdentifiers, function(userAndCompanyFlagsIdentifier) {
                        return migrateAVCUserFlags.migrateFor(userAndCompanyFlagsIdentifier);
                    });
                });
            });
        });
    } else {
        var flagsHelper = require("./lib/flagsHelper")(targetEnv, docClient);

        getAllCompanyProfilesReferenced(flagsHelper)
            .then(function() {
                return getDashboardMetrics(flagsHelper, "AirLink");
            })
            .then(function() {
                return getDashboardMetrics(flagsHelper, "UFOTA");
            })
            .then(function() {
                return getDashboardMetrics(flagsHelper, "AVEP");
            })
            .then(function() {
                return getDashboardMetrics(flagsHelper, "CONNECTIVITY");
            })
            .then(function() {
                return getDashboardMetrics(flagsHelper, "AVC");
            });
    }
} else {
    console.error("\033[1m\033[31mYou must specify the target environment.\n\033[33mSupported values are", SUPPORTED_TARGET_ENVS, "\033[0m");
    process.exit(1);
}
