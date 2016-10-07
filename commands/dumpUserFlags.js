var _ = require("lodash");
var BPromise = require("bluebird");

module.exports = function(targetEnv, docClient) {

    return {
        execute: function(companyId) {
            return new BPromise(function(resolve, reject) {

                // List only the 'relevant' properties we want to retrieve
                var relevantAttributes = [
                    "UserAndCompanyUid",
                    "prefVersion",
                    "startDashboard_widgetsOrder",
                    "monitorSystemsDashboard_widgetsOrder",
                    "MON_SYS_DET_PREF_KEY",
                    "AVOP_DATA_HISTORY_DASHBOARD"
                ];

                var scanOptions = {
                    TableName: targetEnv + "_AV_UI_UserFlags",

                    // Reference documentation for 'FilterExpression': http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.SpecifyingConditions.html#ConditionExpressionReference

                    // Mandatory attributes that are used when a FilterExpression is specified
                    ExpressionAttributeValues: {
                        ":path": "\"path\""
                    }
                };

                var hasPathExpression = _.map(_.without(relevantAttributes, "UserAndCompanyUid", "prefVersion"), attr => `contains (${attr}, :path)`).join(" OR ");
                if (companyId) {
                    // Filter only UserFlags for a given Company identifier where some customizable widgets contain a 'path'
                    scanOptions.FilterExpression = `contains (UserAndCompanyUid, :companyId) AND (${hasPathExpression})`;
                    scanOptions.ExpressionAttributeValues[":companyId"] = companyId;
                } else {
                    // Filter all UserFlags where some customizable widgets contain a 'path'
                    scanOptions.FilterExpression = hasPathExpression;
                }

                var scannedItems = [];

                function onScan(err, data) {
                    if (err) {
                        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                        reject(err);
                    } else {
                        scannedItems = scannedItems.concat(_.map(data.Items, item => {
                            var serialized = _.compact(_.map(_.without(relevantAttributes, "UserAndCompanyUid"), key => item[key] === undefined ? "" : `\"${key}\": ${item[key]}`));
                            return `\"${item.UserAndCompanyUid}\": { ${serialized.join(",")} }`;
                        }));

                        console.error("Count:", data.Count);
                        console.error("ScannedCount:", data.ScannedCount);
                        console.error("LastEvaluatedKey:", data.LastEvaluatedKey);

                        if (data.LastEvaluatedKey) {
                            scanOptions.ExclusiveStartKey = data.LastEvaluatedKey;
                            docClient.scan(scanOptions, onScan);
                        } else {
                            console.log("{", scannedItems.join(","), "}");
                            resolve();
                        }
                    }
                }

                docClient.scan(scanOptions, onScan);
            });
        }
    };
};
