ALMS Dashboard - Widget metrics
===============================

Provide a set of utility functions to query user flags and aggregate some metrics that would be useful for an ALMS PM

Prerequisite
------------

1. [Install Node.js v0.12 or latest](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager)
2. Make sure you have access to AWS and that you have [configured your credentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html). In particular you should have the file `~/.aws/credentials` with two _profiles_ 'prod' and 'preprod':
```
[default]
aws_access_key_id = ...
aws_secret_access_key = ...
[prod]
aws_access_key_id = ...
aws_secret_access_key = ...
[preprod]
aws_access_key_id = ...
aws_secret_access_key = ...
```
3. Go in the `av-flags-metrics` folder
4. Install Node.js dependencies
```sh
$ npm install
```

Getting started
---------------

You can launch the script using the following command, replacing <env> by one of the following values: _na_, _eu_, _dev1_, _qa_ or _LOCAL_
```sh
$ node index <env>
```

You should get reports as following:
```sh
$ node index eu
************************************************************************
** SUMMARY for EU environment
**----------------------
** No Companies using the 'AirLink' CompanyProfile          : 4
** No UserFlags with the flag 'startDashboard_widgetsOrder' : 36
** No UserFlags associated to an 'AirLink' CompanyProfile   : 0
**----------------------
** Number of widgets per ALMS user                          : {}
** Widget deployment rate                                   : {}
************************************************************************

$ node index na
************************************************************************
** SUMMARY for NA environment
**----------------------
** No Companies using the 'AirLink' CompanyProfile          : 2432
** No UserFlags with the flag 'startDashboard_widgetsOrder' : 73
** No UserFlags associated to an 'AirLink' CompanyProfile   : 71
**----------------------
** Number of widgets per ALMS user                          :
{ '2': 1,
  '3': 1,
  '6': 3,
  '7': 1,
  '9': 1,
  '10': 3,
  '11': 1,
  '12': 2,
  '13': 2,
  '14': 1,
  '16': 1,
  '17': 1 }
** Widget deployment rate                                   :
{ upgradeStatus: 3,
  commStatus: 13,
  latestSystemOperations: 7,
  signalStrength: 11,
  deployedApplicationsAndFirmwares: 2,
  commStatusMap: 10,
  register: 15,
  activate: 3,
  monitor: 9,
  alertRules: 15,
  alerts: 9,
  subscriptionUsageData: 1,
  userDocumentation: 14,
  developerDocumentation: 9,
  recentActivity: 7,
  rssi: 5,
  ecio: 4,
  systemState: 2,
  serviceType: 8,
  deployedFirmwares: 4,
  systemType: 8,
  offerIntro: 3,
  templateDistribution: 7,
  deployedApplications: 2,
  commFailure: 2,
  roamingStatus: 2,
  usageStatus: 2 }
************************************************************************
```
