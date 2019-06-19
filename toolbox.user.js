// ==UserScript==
// @name         hu.rxd.hive.toolbox
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  adds some things...
// @author       kirk
// @match        https://issues.apache.org/jira/browse/**
// @match        https://builds.apache.org/job/PreCommit-HIVE-Build/*/testReport/
// @match        http://sustaining-jenkins.eng.hortonworks.com:8080/**/*hive*/*/testReport/**
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @require http://code.jquery.com/jquery-latest.js
// @require https://bowercdn.net/c/urijs-1.19.1/src/URI.min.js
// ==/UserScript==




(function() {
    'use strict';

    // credit:    https://stackoverflow.com/a/4673436/1525291
    if (!String.prototype.format) {
        String.prototype.format = function() {
            var args = arguments;
            return this.replace(/{(\d+)}/g, function(match, number) {
                return typeof args[number] != 'undefined'
                    ? args[number]
                : match
                ;
            });
        };
    }


    function addCustomStyle() {
    var style = $(`<style>
.toolbox_button {
color: blue;
xbackground-color: lightblue;
border: 1px solid lightblue;
    margin:-1px;
    margin-left:1px;
    margin-right: 5px;
    min-width:1em;
    text-align: center;
    text-decoration: none !IMPORTANT;
    display: inline-block;
}
.toolbox_button:hover {
background-color: lightblue;
}
.ptest-status {
display:block;
float:right;
background-color1:orange;
border: 1px solid orange;
font-size:2em;
}
</style>
`);
        $('html > head').append(style);
    }


    //$("a[title='Show details']").css( "border", "3px double red" );

    function createLink(label,link){
        var newLink=$("<a>", {
            title: label,
            href: link,
            class: "toolbox_button"
        }).append( label );
        return newLink;
    }

    function jiraSearch(jql){
        var args = {
            jql:jql
        };
        var uri=URI('https://issues.apache.org/jira/issues/').search(args);
        return uri;
    }

    function relatedTicketsSearch(testInfo) {
        var kwPart=testInfo.keywords.map(function(kw) {
            return ' ( summary ~ "{0}" or description ~ "{0}" or description ~ "{0}.q" )'.format(kw);
        }).join("\n and ");
       return jiraSearch(kwPart + "\nand project = hive order by updated desc");
    }

    function getTestOpts(testInfo) {
        // FIXME: possibly remove mavenPattern from testInfo
        // ultimate: https://api.github.com/search/code?q=filename:TestCliDriver.java+repo:apache/hive
        var testOpts='-Dtest={0}'.format(testInfo.mavenPattern);
        if(testInfo.testClassFull.toLowerCase().indexOf("spark") == -1) {
            testOpts+="\n-DskipSparkTests";
        }
        switch(testInfo.testClass){
            case "TestCliDriver":
            case "TestNegativeCliDriver":
            case "TestMiniLlapCliDriver":
            case "TestMiniLlapLocalCliDriver":
                testOpts+="\n-pl itests/qtest";
                break;
            default:
        }
        return testOpts;
    }

    function buildJobInvocationUri(jobName,testInfo) {
        var testOpts=getTestOpts(testInfo);
        var args={
            KEYWORD: 'R[{0}]'.format(testInfo.mavenPattern),
            M_TEST_OPTS: testOpts
        };
        var u=URI('http://sustaining-jenkins.eng.hortonworks.com:8080/view/hive/job/{0}/parambuild/'.format(jobName)).search(args);
        return u;
    }

    function createTestInfo(txt){
        var ret={};
        var tparts=txt.split(".");
        ret.keywords=[];
        ret.testMethod=tparts.pop();
        ret.testClassFull=tparts.join(".");
        ret.testClass=tparts.pop();
        ret.mavenPattern='{0}#{1}'.format(ret.testClass,ret.testMethod);
        ret.keywords.push(ret.testClass);
        var p = ret.testMethod.replace("]","").split(/\[/);
        if(p.size() == 2 ){
            ret.testParam=p.last();
            ret.keywords.push(ret.testParam);
        }
        return ret;
    }

    // $("tr:has( > td > a[title='Show details'])").css( "border", "3px double green" );
    function processFailureRow(row){
        // $(row).css( "border", "3px double brown" );
        var testLink=$(row).find("td:first-child a[href]");
        var testInfo=createTestInfo(testLink.text());

        var newLinks=[
            createLink("L",relatedTicketsSearch(testInfo)),
            createLink("R",buildJobInvocationUri('hive-check',testInfo)),
            createLink("B",buildJobInvocationUri('hive-bisect',testInfo)),
            ];
        newLinks.each(function (item) {
            item.insertBefore(testLink);
        });
//        testLink.css( "border", "3px double blue" );
    }

    function decorateJenkinsResults() {
        $("tr:has( > td > a[title='Show details'])").each( function() {
            processFailureRow(this);
        });
    }


    function collapseQAComments(){
        $(".activity-comment:has(a[rel=hiveqa]):not(:last)")
        .removeClass("extended")
        .addClass("collapsed");
    }


    function fixAttachmentSortOrder() {

        var p=$('ol:has(>li.attachment-content)');

        $('li.attachment-content').sort(function (a, b) {
            var contentA =parseInt($(a).attr('data-attachment-id'));
            var contentB =parseInt($(b).attr('data-attachment-id'));
            console.log(contentA);
            return (contentA-contentB);
        }).appendTo(p);
    }

    function getAttachments() {
        return $('li.attachment-content').map( function() {
            return {
                name:$(this).find("a").text(),
                time:$(this).find('time').attr('datetime'),
                attachmentId:parseInt($(this).attr('data-attachment-id')),
                url:$(this).find("a").attr('href'),
            }; } ).sort(function(a,b) { return + a.attachmentId - b.attachmentId; });
    }

    function extractTicketId(str){
        var cand=str.replace(/.*\//,'');
        if(cand.match(/^[A-Z]+-[0-9]+$/) != null)
            return cand;
        return null;
    }


    function buildReExecJobInvocationUri(branch,qaInfo,patchUrl) {
        var jobName="hive-ptest-rerun";
        var args={
            KEYWORD: 'R[{2}@{0}@{1}]'.format(patchUrl.match(/[^\/]+$/),branch,ticketId),
            PTEST_JOB_URL: qaInfo.buildUrl,
            PATCH_URL: patchUrl,
        };
  //      alert(args.KEYWORD);
        var u=URI('http://sustaining-jenkins.eng.hortonworks.com:8080/view/hive/job/{0}/parambuild/'.format(jobName)).search(args);
        return u;
    }


    function decorateLastQA() {
        var c=$(".activity-comment:has(a[rel=hiveqa]):last");
        var qaInfo={
            patchUrl: c.find("a.external-link:contains('/attachment/')").text(),
            buildUrl: c.find("a.external-link:contains('/job/')").last().text().match(/.*\/[0-9]+/)+"/"
        };
        if(c.size() == 0 )
            return;
        var c2=c.find(".preformatted");
//        c2.css( "border", "3px double red" );
        createLink("re-run with patch",buildReExecJobInvocationUri("apache/master",qaInfo,qaInfo.patchUrl)).insertAfter(c2);
        createLink("re-run at master",buildReExecJobInvocationUri("apache/master",qaInfo,"")).insertAfter(c2);
    }

    function cachedGet(cacheTime, cacheLabel, url, fnOk, fnFail) {
        var ttlKey='cache.ttl.'+cacheLabel;
        var dataKey='cache.data.'+cacheLabel;
        var ttl=Number(GM_getValue(ttlKey));
        var data=GM_getValue(dataKey);
        var now=Date.now();

        if(Number.isNaN(ttl) || now > ttl) {
            $.get( url, function (data) {
                GM_setValue(ttlKey, now+cacheTime);
                GM_setValue(dataKey, data);
                fnOk(data);
            }, null, "text").fail(fnFail);
        } else {
            console.log("serving "+url+" from cache");
            console.log(data);
            fnOk(data);
        }
    }

    function showQueueStatus(ticketId){
        var id=ticketId.replace(/^[^0-9]+/,"");
        var url="https://builds.apache.org/queue/api/xml?tree=items[actions[parameters[name,value]],task[name]]";

        cachedGet(600*1000, "apache.queue",url,
            function(data) {
            document.apacheQueueData=data;
            var hiveQueue=$(document.apacheQueueData)
            .find("item")
            .filter(
                function (idx,e) {
                    return $(e).find("name").text().match(/HIVE/);
                });
            var hiveInfos=hiveQueue.map( function (idx,queueItem) {
                return $(queueItem).find("parameter")
                    .map(function (idx,u) {
                    return [[$(u).find("name").text(),$(u).find("value").text()]];
                }).toArray().reduce(function(map, obj) {
                    map[obj[0]] = obj[1];
                    return map;
                }, {});
            });
            document.hiveInfos=hiveInfos;
            var qStatus=$('<div id=qStatus>').addClass("ptest-status");
            qStatus.insertAfter($('#summary-val'));

            hiveInfos.each( function (idx,info) {
                var match=info["ISSUE_NUM"]==id;
                $("<a>")
                    .append(match?"■":"□")
                    .attr("title","HIVE-"+info["ISSUE_NUM"])
                    .attr("href","https://issues.apache.org/jira/browse/HIVE-"+info["ISSUE_NUM"])
                    .appendTo(qStatus);
            });
            qStatus.append($("<br>"));
            var issueIdx=document.hiveInfos.toArray().findIndex( function (a) { return a["ISSUE_NUM"] == id;});
            var statusStr;
            if(issueIdx>=0) {
                statusStr="Q: "+(issueIdx+1)+" / " +hiveInfos.size();
            }else{
                statusStr="[N/A] / "+ +hiveInfos.size();
            }
            $('<span>')
                .append(statusStr)
                .appendTo(qStatus);


        },function() {
            $('<span>')
                .addClass("ptest-status")
                .append("xxx")
                .insertAfter($('#summary-val'));
        });
    }

    var ticketId;

    function go(){
        ticketId = extractTicketId(window.location.pathname);
        addCustomStyle();
        decorateJenkinsResults();
        collapseQAComments();
        fixAttachmentSortOrder();
        decorateLastQA();
        console.log("ticketId:"+ticketId);
        if(ticketId != null && ticketId.startsWith("HIVE")) {
            showQueueStatus(ticketId);
        }
    }

/*
    window.addEventListener("load", init, false);
    function init() {
        setTimeout(go, 500, document.body);
    }
*/
    go();


})();
