var _ = require("lodash");
var BPromise = require("bluebird");

module.exports = function(targetEnv, docClient) {

    return {
        // Return detailed information for the given CompanyProfile, i.e. all the flags that are specified for this CompanyProfile
        getCompanyProfileContents: function(companyProfileName) {
            return new BPromise(function(resolve, reject) {
                docClient.query({
                    TableName: targetEnv + "_AV_UI_CompanyProfile",
                    KeyConditionExpression: "ProfileName = :name",
                    ExpressionAttributeValues: {
                        ":name": companyProfileName
                    }
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        },

        // Return the list of Company identifiers that are associated with the given CompanyProfile
        getCompaniesUsingCompanyProfile: function(companyProfileName) {
            return new BPromise(function(resolve, reject) {
                docClient.scan({
                    TableName: targetEnv + "_AV_UI_ProfileForCompany",
                    FilterExpression: "profileName = :name",
                    ExpressionAttributeValues: {
                        ":name": "\"" + companyProfileName + "\""
                    }
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(_.map(data.Items, "CompanyUid"));
                });
            });
        },

        // Return all the UserFlags for which the given Flag key is customized
        getAllUserFlagsWithKey: function(flagKey) {
            var scanFilter = {};
            scanFilter[flagKey] = {
                ComparisonOperator: "NOT_NULL"
            };

            return new BPromise(function(resolve, reject) {
                docClient.scan({
                    TableName: targetEnv + "_AV_UI_UserFlags",
                    ScanFilter: scanFilter
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        },

        // Return the list of CompanyProfiles identifiers that are referenced by Companies
        getAllCompanyProfilesReferenced: function() {
            return new BPromise(function(resolve, reject) {
                docClient.scan({
                    TableName: targetEnv + "_AV_UI_ProfileForCompany"
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        }
    };
};
