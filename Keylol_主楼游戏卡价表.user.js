// ==UserScript==
// @name         Keylol_主楼游戏卡价表
// @version      2020.2.18
// @description  计算主楼游戏的卡牌价格
// @author       CYTMWIA
// @match        http*://keylol.com/t*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // 主楼
    let MAIN_POST = document.getElementById("postlist").children[1]
    
    // 基本信息 appid -> 名称
    let APPNAMES = {}
    let links = MAIN_POST.getElementsByClassName("steam-info-link")
    for (let i=0;i<links.length;i+=1) {
        let appid = links[i].href.split("/")[4]
        let name = links[i].innerText
        APPNAMES[appid] = name
    }

    if (Object.keys(APPNAMES).length==0) {
        return; // 无商店链接
    }

    // UI sytle
    document.head.innerHTML+= ""
        +"<style>"
        +".price_table {"
        +"    border-width: thin;"
        +"    border-color: grey;"
        +"}"
        +".grid_close {"
        +"    border-style: solid;"
        +"}"
        +".trow_mid {"
        +"    border-style: none solid;"
        +"}"
        +".trow_end {"
        +"    border-style: solid none solid solid;"
        +"}"
        +".text_block {"
        +"    border-style: none;"
        +"    background-color: rgb(87, 186, 232);"
        +"    color: white;"
        +"}"
        +".cal_btn {"
        +"    position: relative;"
        +"    top: 1.5ex;"
        +"    left: 10px;"
        +"}"
        +"</style>"

    // 添加UI元素
    MAIN_POST.getElementsByClassName("plc")[0].innerHTML = ""
        +'<br>'
        +'<div class="t_fsz" style="background-color: rgb(229, 237, 242);">'
        +'    <div class="text_block">卡牌价格表</div>'
        +'    <button id="cal_btn" class="text_block cal_btn">生成表格</button>'
        +'    <br><br>'
        +'    <table id="price_table" class="price_table" style="border-style: solid;">'
        +'    </table>'
        +'</div>'
        + MAIN_POST.getElementsByClassName("plc")[0].innerHTML

    let PRICE_TABLE = document.getElementById("price_table")

    function addRow(lst,classname="grid_close") {
        let row = "<tr>"
        for (let i=0;i<lst.length;i+=1)
            row+="<td class=\"price_table "+classname+"\">"+lst[i]+"</td>"
        row += "</tr>"
        PRICE_TABLE.innerHTML+=row
    }

    function clearTable() {
        PRICE_TABLE.innerHTML=""
    }

    function round2(num) {
        return Math.round(num*100)/100
    }

    function makeTable(headrow,columns,endrow) {
        // headrow = ["列1行1","列2行1","列3行1"...]
        /* 
        columns = [
            [列1行2,行3,行4...行n-1],
            [列2行2,行3,行4...行n-1],
            [列3行2,行3,行4...行n-1],
            ...
        ]
        */
        // endrow = ["列1行n","{sum}","列3行n"...]
        // {sum} : 该列总和

        clearTable()

        addRow(headrow)

        if (columns.length!=0) {
            for (let i=0;i<columns[0].length;i+=1) {
                let row = []
                for (let j=0;j<headrow.length;j+=1) {
                    row.push(columns[j][i])
                }
                addRow(row)
            }
            endrow.forEach((value,idx)=>{
                if (value=="{sum}") {
                    endrow[idx] = columns[idx].reduce((acc,cur)=>{
                        return acc+cur
                    })
                    endrow[idx] = round2(endrow[idx])
                }
            })
        }

        addRow(endrow)
    }

    let APPINFO_POOL = {} // 数据来自 steamdb.keylol.com , 与现实数据有延迟, 计划弃用
    function getAppInfo(appid,callback) {
        if (APPINFO_POOL[appid] != undefined) {
            callback()
        } else {
            GM_xmlhttpRequest({
                method: 'GET',
                url: "https://steamdb.keylol.com/app/"+appid+"/data.js?v=38",
                onload: function (response) {
                    if (response.status === 200) {
                        let text = response.responseText
                        APPINFO_POOL[appid] = JSON.parse(text.substring(5,text.lastIndexOf(")")))
                        callback()
                    }
                }
            })
        }
    }

    document.getElementById("cal_btn").addEventListener("click",()=>{
        for (let [appid,appname] of Object.entries(APPNAMES)){
            getAppInfo(appid,()=>{

                let columns = [[],[],[],[],[],[]]
                for (let [id,info] of Object.entries(APPINFO_POOL)) {
                    columns[0].push(id)
                    columns[1].push(info["name"])
                    if (info["card"]!=undefined){
                        let c,a
                        columns[2].push(c=info["card"]["normal"]["count"])
                        columns[3].push(a=info["card"]["normal"]["average"])
                        columns[4].push(round2(Math.ceil(c/2)*a))
                        columns[5].push(round2(c*a))
                    } else {
                        for (let i=2;i<6;i+=1)
                            columns[i].push(0)
                    }
                }

                makeTable(
                    ["appid","名称","普卡数","普卡均价","普卡半套","普卡一套"],
                    columns,
                    ["总和","","{sum}","","{sum}","{sum}"]
                )

            })
        }
    })

})();