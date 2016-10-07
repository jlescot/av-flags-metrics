var _ = require("lodash");
var BPromise = require("bluebird");

module.exports = function(targetEnv, docClient) {

    return {

        // Return the list of Company identifiers that are associated with the 'AirLink ' CompanyProfile
        listAirLinkCompanies: function() {
            return new BPromise(function(resolve, reject) {
                docClient.scan({
                    TableName: targetEnv + "_AV_UI_ProfileForCompany",
                    FilterExpression: "profileName = :name",
                    ExpressionAttributeValues: {
                        ":name": "\"AirLink\""
                    }
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(_.map(data.Items, "CompanyUid"));
                });
            });
        },

        // Return all the UserFlags identifiers that apply to the given Company identifier
        getAllUserFlagsForCompany: function(companyId) {
            return new BPromise(function(resolve, reject) {
                docClient.scan({
                    TableName: targetEnv + "_AV_UI_UserFlags",
                    AttributesToGet: ["UserAndCompanyUid"],
                    ScanFilter: {
                        UserAndCompanyUid: {
                            ComparisonOperator: "CONTAINS",
                            AttributeValueList: [companyId]
                        }
                    }
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(_.map(data.Items, "UserAndCompanyUid"));
                });
            });
        },

        // Migrate Flags for a given 'UserAndCompanyUid' so that it gets compliant with the AirLink offer
        //
        // 0. First check: in case the 'prefVersion' is missing or is too old, we remove the whole UserAndCompanyFlags item!
        //
        // 1. Migrate the 'startDashboard_widgetsOrder'
        // - We will remove the key (so that it resets to the default AVC Dashboard configuration)
        // - In case a 'configurable' widget was available, we store it in a new 'startDashboard_widgetsOrder_oldOffer' key
        //
        // 2. Migrate the 'monitorSystemsDashboard_widgetsOrder'
        // - We will remove the key (so that it resets to the default AVC Dashboard configuration + default grid configuration)
        //
        // 3. Migrate the 'MON_SYS_DET_PREF_KEY'
        // - We will remove the key (so that it resets to the default AVC Dashboard configuration)
        // - In case a 'configurable' widget was available, we store it in a new 'MON_SYS_DET_PREF_KEY_oldOffer' key
        migrateFor: function(userAndCompanyFlagsIdentifier, doItForReal) {
            return new BPromise(function(resolve, reject) {
                docClient.get({
                    TableName: targetEnv + "_AV_UI_UserFlags",
                    Key: {
                        UserAndCompanyUid: userAndCompanyFlagsIdentifier
                    },
                    AttributesToGet: [
                        "UserAndCompanyUid",
                        "prefVersion",
                        "startDashboard_widgetsOrder",
                        "monitorSystemsDashboard_widgetsOrder",
                        "MON_SYS_DET_PREF_KEY",
                        "AVOP_DATA_HISTORY_DASHBOARD",
                        "OFFER_TYPE"
                    ]
                }, function(err, data) {
                    if (err) {
                        reject(err);
                    } else {
                        console.log("\n\033[1mUserAndCompanyFlags Analysis:", data.Item.UserAndCompanyUid, "\033[0m");

                        if (!data.Item.prefVersion || data.Item.prefVersion.indexOf("16.0") === -1) {
                            console.log(data.Item.prefVersion ? "  - Too old 'prefVersion' (" + data.Item.prefVersion + ")" : "  - Missing 'prefVersion' !!", "The whole UserAndCompanyFlags will be removed!");
                            if (doItForReal) {
                                docClient.delete({
                                    TableName: targetEnv + "_AV_UI_UserFlags",
                                    Key: {
                                        UserAndCompanyUid: userAndCompanyFlagsIdentifier
                                    }
                                }, function(err, data) {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }
                        } else {
                            var attributeUpdates = {};

                            if (data.Item.startDashboard_widgetsOrder) {
                                console.log("  - A 'startDashboard_widgetsOrder' configuration is available. It should be updated!");
                                attributeUpdates.startDashboard_widgetsOrder = {
                                    Action: "DELETE"
                                };
                            }
                            if (data.Item.monitorSystemsDashboard_widgetsOrder) {
                                console.log("  - A 'monitorSystemsDashboard_widgetsOrder' configuration is available. It should be updated!");
                                attributeUpdates.monitorSystemsDashboard_widgetsOrder = {
                                    Action: "DELETE"
                                };
                            }
                            if (data.Item.MON_SYS_DET_PREF_KEY) {
                                console.log("  - A 'MON_SYS_DET_PREF_KEY' configuration is available. It should be updated!");
                                attributeUpdates.MON_SYS_DET_PREF_KEY = {
                                    Action: "DELETE"
                                };
                            }
                            if (data.Item.AVOP_DATA_HISTORY_DASHBOARD) {
                                console.log("  - A 'AVOP_DATA_HISTORY_DASHBOARD' configuration is available. It should be updated!");
                                attributeUpdates.AVOP_DATA_HISTORY_DASHBOARD = {
                                    Action: "DELETE"
                                };
                            }

                            if (data.Item.startDashboard_widgetsOrder && data.Item.startDashboard_widgetsOrder.indexOf("\"widgetType\":\"fleetdata\"") !== -1) {
                                console.log("  - At least a 'configurable' widget in the Start Dashboard... saving old 'startDashboard_widgetsOrder' configuration into 'startDashboard_widgetsOrder_oldOffer'");
                                attributeUpdates.startDashboard_widgetsOrder_oldOffer = {
                                    Action: "PUT",
                                    Value: data.Item.startDashboard_widgetsOrder
                                };
                            }
                            if (data.Item.MON_SYS_DET_PREF_KEY && data.Item.MON_SYS_DET_PREF_KEY.indexOf("\"widgetType\":\"systemLastData\"") !== -1 || data.Item.MON_SYS_DET_PREF_KEY && data.Item.MON_SYS_DET_PREF_KEY.indexOf("\"widgetType\":\"dataHistory\"") !== -1) {
                                console.log("  - At least a 'configurable' widget in the System Details Dashboard... saving old 'MON_SYS_DET_PREF_KEY' configuration into 'MON_SYS_DET_PREF_KEY_oldOffer'");
                                attributeUpdates.MON_SYS_DET_PREF_KEY_oldOffer = {
                                    Action: "PUT",
                                    Value: data.Item.MON_SYS_DET_PREF_KEY
                                };
                            }

                            if (doItForReal) {
                                docClient.update({
                                    TableName: targetEnv + "_AV_UI_UserFlags",
                                    Key: {
                                        UserAndCompanyUid: userAndCompanyFlagsIdentifier
                                    },
                                    AttributeUpdates: attributeUpdates
                                }, function(err, data) {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }
                        }
                    }
                });
            });
        }
    };
};
