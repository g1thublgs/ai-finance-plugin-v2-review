$(function(){
	$(".toogleIcon").click(function(){
        var area = $(this).parents(".toogleBox").find(".toogleArea");
		var flag = $(this).hasClass("closex");
		flag?$(this).removeClass("closex").parents(".toogleBox").removeClass("boxClose"):$(this).addClass("closex").parents(".toogleBox").addClass("boxClose");
		area.toggle();
	})
});

function fileshow (row, value) {
    if (row.FJLX_DM == "电子发票") {
        return '<a onclick="viewDzfp(\'' + row.WJ_MC + '\',\'' + row.LX + '\')">' + row.WJ_MC + '</a>';
    } else {
        return '<a onclick="viewFile(\'' + row.LSH + '\',\'' + row.WJ_MC + '\')">' + row.WJ_MC + '</a>';
    }
}

function viewFile(fileId,name){
    //ntkoView(fileId, name);

    //以下为不依赖ntko（包括文档编辑器）实现文档在线预览
    var contextPath = "/"+window.location.pathname.split('/')[1];
    var baseUrl = window.location.origin+contextPath;
    var path = contextPath + "/net/hitina/biz/nk/fjsc/FjscUnite.downloadFile.svc?fjLsh="+fileId;
    var fileType = name.substr(name.lastIndexOf(".")+1);
    var win;
    if(fileType.toLowerCase() == "xls" || fileType.toLowerCase() == "xlsx") {//excel在线预览
        win = window.open(baseUrl+"/biz/nk/common/excelShowOnline.html?path="+encodeURIComponent(path),"fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }else if(fileType.toLowerCase() == "pdf"){//pdf在线预览
        var url = "/biz/nk/common/viewImgDetail.html?lsh="+ fileId +"&isCovertFlag=true&file="+encodeURIComponent(path);
        //win = window.open(baseUrl+"/biz/voucher/electronicInvoice/pdfjs-2.6.347-es5-dist/web/viewer.html?file="+encodeURIComponent(path),"fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
        win = window.open(baseUrl+url,"fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }else if(fileType.toLowerCase() == "ofd") {//ofd在线预览
        win = window.open(baseUrl+"/biz/voucher/electronicInvoice/ofdshow/viewer.html?file="+path,"fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
        //win = window.open(baseUrl+"/biz/nk/common/ofdShowOnline.html?path="+encodeURIComponent(path),"fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }else if(fileType.toLowerCase() == "jpg" || fileType.toLowerCase() == "jpeg" || fileType.toLowerCase() == "bmp" || fileType.toLowerCase() == "png"
    || fileType.toLowerCase() == "tiff" || fileType.toLowerCase() == "gif" || fileType.toLowerCase() == "svg" || fileType.toLowerCase() == "psd") {
        win = window.open(baseUrl+"/biz/nk/common/viewImgDetail.html?lsh="+fileId, "fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }else if(fileType.toLowerCase() == "doc"){
        win = window.open(baseUrl+"/biz/nk/common/docShowOnline.html?fjLsh="+fileId, "fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }else if(fileType.toLowerCase() == "txt"){
        win = window.open(baseUrl+"/biz/nk/common/txtShowOnline.html?path="+encodeURIComponent(path),"fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }else if(fileType.toLowerCase() == "docx"){
        win = window.open(baseUrl+"/biz/nk/common/docxShowOnline.html?path="+encodeURIComponent(path), "fullWindow","width="+screen.width+",height="+screen.height+",location=no,tools=no,states=no,scrollbars=no,resizable");
    }
    //统一更改打开窗口的标题为文档名称（延时）
    setTimeout(function(){
        win.document.title = name;
        },5000);
}

function viewDzfp(FPID, FPLX) {
    //电子发票
    // dialogHandler = $.showDialog({
    //     url: "../common/dzfpView.html?fpid=" + FPID + "&fplx=" + FPLX,
    //     width: "90%",
    //     height: "90%",
    //     title: "电子发票",
    //     buttons: [{
    //         text: "关&nbsp;&nbsp;闭",
    //         dismissible: true
    //     }]
    // });
    var url= "../common/dzfpView.html?fpid=" + FPID + "&fplx=" + FPLX;
    window.open(encodeURI(url),target ="helpFrame");
}
 
 function next(){
	 $("#id2").click();
 }
 
 function pre(){
	 $("#id1").click();
 }