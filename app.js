var express = require("express");
var exphbs = require('express3-handlebars');
var request = require("request");
var bodyParser = require("body-parser");

var utils = require("./utils");

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use('**/assets', express.static(__dirname + '/assets'));
app.use('**/public', express.static(__dirname + "/public"));

app.set('views', __dirname + '/views');
app.engine('html', exphbs.create({
  defaultLayout: 'main.html',
  layoutsDir: app.get('views') + '/layouts',
  partialsDir: [app.get('views') + '/partials']
}).engine);
app.set('view engine', 'html');

var server = app.listen((process.env.PORT || 5000), function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log("JAMB Buddy Server running on http://%s:%s", host, port);
    console.log('');

    process.on('uncaughtException', function (error) {
        console.log(error);
        console.log(error.stack);
        console.trace();
    });
});

var BASE_URL = "https://jamb-bot.herokuapp.com/";

// Server index page
app.get("/", function (req, res) {
    res.render('index.html');
});

// Privacy Policy
app.get("/privacy", function (req, res) {
    res.render('privacy.html');
});

//to test if the server is up
app.get("/ping", function (req, res) {
    res.send("pong");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
    if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
        console.log("Verified webhook");
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", function (req, res) {
    // Make sure this is a page subscription
    if (req.body.object == "page") {
        // Iterate over each entry
        // There may be multiple entries if batched
        req.body.entry.forEach(function(entry) {
            // Iterate over each messaging event
            entry.messaging.forEach(function(event) {
                if (event.postback || (event.message && event.message.quick_reply)) {
                    processPostback(event);
                } else if (event.message) {
                    processMessage(event);
                }
            });
        });

        res.sendStatus(200);
    }
});

function processPostback(event) {
    var senderId = event.sender.id;
    var payload = "";
    if (event.message && event.message.quick_reply) {
        payload = event.message.quick_reply.payload;
    } else {
        payload = event.postback.payload;
    }

    if (payload === "Greeting") {
        // Get user's first name from the User Profile API
        // and include it in the greeting
        request({
            url: "https://graph.facebook.com/v2.6/" + senderId,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var greeting = "";
            if (error) {
                console.log("Error getting user's name: " +  error);
            } else {
                var bodyObj = JSON.parse(body);
                greeting = "Hi " + bodyObj.first_name + ". ";
            }
            var message = greeting + "I am your JAMB buddy. I am here to help you prepare for JAMB." + 
                "\nCurrently I have access to only a few questions but I am always working for you, gathering more from various corners on the internet." +
                "\n\nFor more info please visit http://jamb-bot.herokuapp.com/";
            sendMessage(senderId, {text: message});

            message = createMessageForWhatSubjDoYouWant();
            sendMessage(senderId, message);
        });
    }
    else if (payload === "HELP") { //user wants help
        // Get user's first name from the User Profile API
        // and include it in the help
        request({
            url: "https://graph.facebook.com/v2.6/" + senderId,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var hi = "";
            if (error) {
                console.log("Error getting user's name: " +  error);
            } else {
                var bodyObj = JSON.parse(body);
                hi = "Hi " + bodyObj.first_name + ". ";
            }
            var message = hi + "If you need help with something please visit http://jamb-bot.herokuapp.com/";
            sendMessage(senderId, {text: message});
        });
    }
    else if (payload.indexOf("OPTION_") == 0) {
        //the format of payload is OPTION_A/eng/0
        var indexOfSlash = payload.indexOf('/');
        var qId = payload.substr(indexOfSlash + 1);
        var indexOf_ = payload.indexOf('_');
        var option = payload.substring(indexOf_ + 1, indexOfSlash);

        sendAnswerQuestion(senderId, qId, option);
    }
    else if (payload.indexOf("QUESTION_ANSWER/") == 0) {
        var indexOfSlash = payload.indexOf('/');
        var qId = payload.substr(indexOfSlash + 1);

        reactToAnswerQuestion(senderId, qId);
    }
    else if (payload.indexOf("QUESTION_EXPLAIN/") == 0) {
        var indexOfSlash = payload.indexOf('/');
        var qId = payload.substr(indexOfSlash + 1);

        reactToExplainQuestion(senderId, qId);
    }
    else if (payload.indexOf("QUESTION_NEXT/") == 0) {
        var indexOfSlash = payload.indexOf('/');
        var qId = payload.substr(indexOfSlash + 1);

        reactToNextQuestion(senderId, qId);
    }
    else if (payload.indexOf("QUESTION_REPORT/") == 0) {
        var indexOfSlash = payload.indexOf('/');
        var qId = payload.substr(indexOfSlash + 1);

        reactToReportQuestion(senderId, qId);
    }
    else if (payload.indexOf("SUBJECT/") == 0) {
        var indexOfSlash = payload.indexOf('/');
        var subjId = payload.substr(indexOfSlash + 1);

        sendSubjectQuestion(senderId, subjId);
    }
    else if (payload.indexOf("SUBJECT_WRONG") == 0) {
        sendMessage(senderId, {text: "OK. Sorry about that."});
        var message = createMessageForWhatSubjDoYouWant();
        sendMessage(senderId, message);
    } 
    else if (payload.indexOf("SUBJECT_LIST") == 0) {
        sendSubjectList(senderId);
    }
    else if (payload === "STOP") { //user wants to stop now
        // Get user's first name from the User Profile API
        // and include it in the goodbye
        request({
            url: "https://graph.facebook.com/v2.6/" + senderId,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var bye = "";
            if (error) {
                console.log("Error getting user's name: " +  error);
            } else {
                var bodyObj = JSON.parse(body);
                bye = "Bye " + bodyObj.first_name + ". ";
            }
            var message = bye + "It was really nice practising with you. Hope we chat again soon." +
                "\n\nFor more info please visit http://jamb-bot.herokuapp.com/";//TODO: put a button to link to examhub.com when it is ready
            sendMessage(senderId, {text: message});
        });
    }
}

function processMessage(event) {
    if (!event.message.is_echo) {
        var message = event.message;
        var senderId = event.sender.id;

        console.log("Received message from senderId: " + senderId);
        console.log("Message is: " + JSON.stringify(message));

        // You may get a text or attachment but not both
        if (message.text) {
            var formattedMsg = message.text.toLowerCase().trim();

            if (formattedMsg.indexOf("hello") > -1 || formattedMsg.indexOf("hey") > -1 || formattedMsg.indexOf("hi") > -1 || formattedMsg.indexOf("good ") > -1 || //good morning, good day...
                formattedMsg.indexOf("how") > -1 || formattedMsg.indexOf("hw") > -1 || //hw fr
                formattedMsg.indexOf("start") > -1 || formattedMsg.indexOf("begin") > -1 ||
                formattedMsg.indexOf("subject") > -1 || formattedMsg.indexOf("course") > -1 || formattedMsg.indexOf("program") > -1) {
                //assume the user wants to change subjects
                sendMessage(senderId, createMessageForWhatSubjDoYouWant());
            }
            else if (formattedMsg.indexOf("bye") > -1 || formattedMsg.indexOf("later") > -1 || 
                    formattedMsg.indexOf("complete") > -1 || formattedMsg.indexOf("end") > -1 || formattedMsg.indexOf("finish") > -1 || formattedMsg.indexOf("stop") > -1) {
                // Get user's first name from the User Profile API
                // and include it in the goodbye
                request({
                    url: "https://graph.facebook.com/v2.6/" + senderId,
                    qs: {
                        access_token: process.env.PAGE_ACCESS_TOKEN,
                        fields: "first_name"
                    },
                    method: "GET"
                }, function(error, response, body) {
                    var bye = "";
                    if (error) {
                        console.log("Error getting user's name: " +  error);
                    } else {
                        var bodyObj = JSON.parse(body);
                        bye = "Bye " + bodyObj.first_name + ". ";
                    }
                    var message = bye + "It was really nice practising with you. Hope we chat again soon." +
                        "\n\nFor more info please visit http://jamb-bot.herokuapp.com/";//TODO: put a button to link to examhub.com when it is ready
                    sendMessage(senderId, {text: message});
                });
            }
            else if (formattedMsg.indexOf("help") > -1 || formattedMsg === "?") {
                // Get user's first name from the User Profile API
                // and include it in the help
                request({
                    url: "https://graph.facebook.com/v2.6/" + senderId,
                    qs: {
                        access_token: process.env.PAGE_ACCESS_TOKEN,
                        fields: "first_name"
                    },
                    method: "GET"
                }, function(error, response, body) {
                    var hi = "";
                    if (error) {
                        console.log("Error getting user's name: " +  error);
                    } else {
                        var bodyObj = JSON.parse(body);
                        hi = "Hi " + bodyObj.first_name + ". ";
                    }
                    var message = hi + "If you need help with something please visit http://jamb-bot.herokuapp.com/";
                    sendMessage(senderId, {text: message});
                });
            }
            else if (formattedMsg === "a" || formattedMsg === "b" || formattedMsg === "c" || formattedMsg === "d" || formattedMsg === "e") {
                utils.getUserQuestionId(senderId, function(error, qid) {
                    if (qid) {
                        sendAnswerQuestion(senderId, qid, formattedMsg);
                    }
                    else {
                        sendMessage(senderId, {text: "Oops! For some reason I can't find the question for you at the moment. Sorry about that."});
                    }
                });
            }
            else if (formattedMsg === "answer") {
                utils.getUserQuestionId(senderId, function(error, qid) {
                    if (qid) {
                        reactToAnswerQuestion(senderId, qid);
                    }
                    else {
                        sendMessage(senderId, {text: "Oops! For some reason I can't find the question for you at the moment. Sorry about that."});
                    }
                });
            }
            else if (formattedMsg === "explain") {
                utils.getUserQuestionId(senderId, function(error, qid) {
                    if (qid) {
                        reactToExplainQuestion(senderId, qid);
                    }
                    else {
                        sendMessage(senderId, {text: "Oops! For some reason I can't find the question for you at the moment. Sorry about that."});
                    }
                });
            }
            else if (formattedMsg === "next") {
                utils.getUserQuestionId(senderId, function(error, qid) {
                    if (qid) {
                        reactToNextQuestion(senderId, qid);
                    }
                    else {
                        sendMessage(senderId, {text: "Oops! For some reason I can't find the question for you at the moment. Sorry about that."});
                    }
                });
            }
            else if (formattedMsg === "wrong") {
                utils.getUserQuestionId(senderId, function(error, qid) {
                    if (qid) {
                        reactToReportQuestion(senderId, qid);
                    }
                    else {
                        sendMessage(senderId, {text: "Oops! For some reason I can't find the question for you at the moment. Sorry about that."});
                    }
                });
            }
            else if (formattedMsg.indexOf("ye") == 0 || formattedMsg.indexOf("yh") == 0) { //yes, yh, yeah, ...
                utils.getUserSubjectId(senderId, function(error, sid) {
                    if (sid) {
                        sendSubjectQuestion(senderId, sid);
                    }
                    else {
                        sendMessage(senderId, {text: "Oops! For some reason I can't find the subject for you at the moment. Sorry about that."});
                    }
                });
            }
            else if (formattedMsg.indexOf("no") == 0 || formattedMsg.indexOf("nah") == 0) { //no, nope, nah, ...
                sendMessage(senderId, {text: "OK. Sorry about that."});
                message = createMessageForWhatSubjDoYouWant();
                sendMessage(senderId, message);
            }
            else if (formattedMsg.indexOf("subject") > -1 && (formattedMsg.indexOf("list") > -1 || formattedMsg.indexOf("option") > -1)) {
                sendSubjectList(senderId);
            }
            else {
                message = createMessageForConfirmSubject(senderId, formattedMsg);
                sendMessage(senderId, message);
            }
        } else if (message.attachments) {//TODO: how to know if attachment is thumbs up, and hw to respond appropriately
            // Get user's first name from the User Profile API
            // and include it in the warning
            request({
                url: "https://graph.facebook.com/v2.6/" + senderId,
                qs: {
                    access_token: process.env.PAGE_ACCESS_TOKEN,
                    fields: "first_name"
                },
                method: "GET"
            }, function(error, response, body) {
                var name = "OK. ";
                if (error) {
                    console.log("Error getting user's name: " +  error);
                } else {
                    var bodyObj = JSON.parse(body);
                    name = "OK " + bodyObj.first_name + ". ";
                }
                var message = name + "Let's continue.";
                sendMessage(senderId, {text: message});
            });
        }
    }
}

function createMessageForConfirmSubject(recipientId, subject) {
    var subjName = "any subject", subjCode = "*";
    var message = {};

    if (subject.indexOf("acc") > -1) {
        subjName = "Accounting";
        subjCode = "acc";
    }
    else if (subject.indexOf("agr") > -1) {
        subjName = "Agricultural Science";
        subjCode = "agric";
    }
    else if (subject.indexOf("ara") > -1) {
        subjName = "Arabic";
        subjCode = "arab";
    }
    else if (subject.indexOf("bio") > -1) {
        subjName = "Biology";
        subjCode = "bio";
    }
    else if (subject.indexOf("che") > -1) {
        subjName = "Chemistry";
        subjCode = "chem";
    }
    else if (subject.indexOf("com") > -1) {
        subjName = "Commerce";
        subjCode = "comm";
    }
    else if (subject.indexOf("crs") > -1 || subject.indexOf("crk") > -1 || subject.indexOf("chr") > -1) {
        subjName = "Christian Religion Study";
        subjCode = "crs";
    }
    else if (subject.indexOf("eco") > -1) {
        subjName = "Economics";
        subjCode = "eco";
    }
    else if (subject.indexOf("eng") > -1) {
        subjName = "English Language";
        subjCode = "eng";
    }
    else if (subject.indexOf("geo") > -1) {
        subjName = "Geography";
        subjCode = "geo";
    }
    else if (subject.indexOf("gov") > -1) {
        subjName = "Government";
        subjCode = "gov";
    }
    else if (subject.indexOf("hau") > -1) {
        subjName = "Hausa";
        subjCode = "hau";
    }
    else if (subject.indexOf("his") > -1) {
        subjName = "History";
        subjCode = "hist";
    }
    else if (subject.indexOf("igbo") > -1 || subject.indexOf("igb") > -1 || subject.indexOf("ibo") > -1) {
        subjName = "Igbo";
        subjCode = "igbo";
    }
    else if (subject.indexOf("irs") > -1 || subject.indexOf("irk") > -1 || subject.indexOf("isl") > -1) {
        subjName = "Islamic Religion Knowledge";
        subjCode = "irk";
    }
    else if (subject.indexOf("mat") > -1) {
        subjName = "Mathematics";
        subjCode = "math";
    }
    else if (subject.indexOf("lit") > -1) {
        subjName = "Literature in English";
        subjCode = "litt";
    }
    else if (subject.indexOf("phy") > -1) {
        subjName = "Physics";
        subjCode = "phy";
    }
    else if (subject.indexOf("yor") > -1) {
        subjName = "Yoruba";
        subjCode = "yor";
    }

    if (subjCode == "*") {
        //message = {text: "Sorry I didn't get that. What subject would you like to practise?"};
        message = createMessageForWhatSubjDoYouWant();
    }
    else {
        utils.setUserSubjectId(recipientId, subjCode, function(error, data) {});

        /*message = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "OK. Shall we begin practising " + subjName + "?",
                    buttons: [
                    {
                        type: "postback",
                        title: "Yes",
                        payload: "SUBJECT/" + subjCode
                    },
                    {
                        type: "postback",
                        title: "No",
                        payload: "SUBJECT_WRONG"
                    }]
                }
            }
        };*/

        message = {
            text: "OK. Shall we begin practising " + subjName + "?",
            quick_replies: [
            {
                content_type: "text",
                title: "Yes",
                payload: "SUBJECT/" + subjCode
            },
            {
                content_type: "text",
                title: "No",
                payload: "SUBJECT_WRONG"
            }]
        };
    }

    return message;
}

function createMessageForAnswer(question, correct) {
    var buttons = [];
    var remark = "";
    buttons.push({type: "postback", title: "Next", payload: "QUESTION_NEXT/" + question.id});
    if (correct) {
        remark = "Yayy, nice job \ud83d\udc4d";
    }
    else {
        remark = "Nope, wrong answer!";
        buttons.push({type: "postback", title: "Answer", payload: "QUESTION_ANSWER/" + question.id});
    }
    if (question.explanation) {
        buttons.push({type: "postback", title: "Explain", payload: "QUESTION_EXPLAIN/" + question.id});
    }
    //buttons.push({type: "postback", title: "Wrong", payload: "QUESTION_REPORT/" + question.id});
    var message = {
        attachment: {
            type: "template",
            payload: {
                template_type: "button",
                text: remark,
                buttons: buttons
            }
        }
    };

    return message;
}

function createMessageForQuestion(question) {
    var text = question.body;
    var buttons = [];
    if (question.options) {
        if (question.options.a) {
            text += "\n\nA: " + question.options.a;
            buttons.push({type: "postback", title: "A", payload: "OPTION_A/" + question.id});
        }
        if (question.options.b) {
            text += "\nB: " + question.options.b;
            buttons.push({type: "postback", title: "B", payload: "OPTION_B/" + question.id});
        }
        if (question.options.c) {
            text += "\nC: " + question.options.c;
            buttons.push({type: "postback", title: "C", payload: "OPTION_C/" + question.id});
        }
        if (question.options.d) {
            text += "\nD: " + question.options.d;
            buttons.push({type: "postback", title: "D", payload: "OPTION_D/" + question.id});
        }
        if (question.options.e) {
            text += "\nE: " + question.options.e;
            buttons.push({type: "postback", title: "E", payload: "OPTION_E/" + question.id});
        }
    }
    var message = {
        attachment: {
            type: "template",
            payload: {
                template_type: "button",
                text: text,
                buttons: buttons
            }
        }
    };

    return message;
}

function createMessagesForOptions(question) {
    var messages = [];
    if (question.options) {
        if (question.options.a) {
            messages.push(createTextWithButtonsMessage("A: " + question.options.a, [{type: "postback", title: "A", payload: "OPTION_A/" + question.id}]));
        }
        else if (question.options.a_image) {
            messages.push(createImageWithButtonsMessage("A", "option a", BASE_URL + question.options.a_image, [{type: "postback", title: "A", payload: "OPTION_A/" + question.id}]));
        }

        if (question.options.b) {
            messages.push(createTextWithButtonsMessage("B: " + question.options.b, [{type: "postback", title: "B", payload: "OPTION_B/" + question.id}]));
        }
        else if (question.options.b_image) {
            messages.push(createImageWithButtonsMessage("B", "option b", BASE_URL + question.options.b_image, [{type: "postback", title: "B", payload: "OPTION_B/" + question.id}]));
        }

        if (question.options.c) {
            messages.push(createTextWithButtonsMessage("C: " + question.options.c, [{type: "postback", title: "C", payload: "OPTION_C/" + question.id}]));
        }
        else if (question.options.c_image) {
            messages.push(createImageWithButtonsMessage("C", "option c", BASE_URL + question.options.c_image, [{type: "postback", title: "C", payload: "OPTION_C/" + question.id}]));
        }

        if (question.options.d) {
            messages.push(createTextWithButtonsMessage("D: " + question.options.d, [{type: "postback", title: "D", payload: "OPTION_D/" + question.id}]));
        }
        else if (question.options.d_image) {
            messages.push(createImageWithButtonsMessage("D", "option d", BASE_URL + question.options.d_image, [{type: "postback", title: "D", payload: "OPTION_D/" + question.id}]));
        }

        if (question.options.e) {
            messages.push(createTextWithButtonsMessage("E: " + question.options.e, [{type: "postback", title: "E", payload: "OPTION_E/" + question.id}]));
        }
        else if (question.options.e_image) {
            messages.push(createImageWithButtonsMessage("E", "option e", BASE_URL + question.options.e_image, [{type: "postback", title: "E", payload: "OPTION_E/" + question.id}]));
        }
    }

    return messages;
}

function createMessageForWhatSubjDoYouWant() {
    var message = {
        text: "What subject would you like to practise?",
        quick_replies: [
        {
            content_type: "text",
            title: "Show Subject List",
            payload: "SUBJECT_LIST"
        }]
    };

    return message;
}

function createImageMessage(url) {
    var message = {
        attachment: {
            type: "image",
            payload: {
                url: url
            }
        }
    };

    return message;
}
function createImageWithButtonsMessage(title, subtitle, url, buttons) {
    var message = {
        attachment: {
            type: "template",
            payload: {
                template_type: "generic",
                elements: [{
                    title: title,
                    subtitle: subtitle,
                    image_url: url,
                    buttons: buttons
                }]
            }
        }
    };

    return message;
}
function createTextWithButtonsMessage(text, buttons) {
    var message = {
        attachment: {
            type: "template",
            payload: {
                template_type: "button",
                text: text,
                buttons: buttons
            }
        }
    };

    return message;
}

//reacts to user input 'answer'
function reactToAnswerQuestion(recipientId, qId) {
    function afterGettingQuestion(error, question) {
        if (question && question.answer) {
            var buttons = [];
            buttons.push({type: "postback", title: "Next", payload: "QUESTION_NEXT/" + qId});
            if (question.explanation) {
                buttons.push({type: "postback", title: "Explain", payload: "QUESTION_EXPLAIN/" + qId});
            }
            var message = createTextWithButtonsMessage(question.answer.toUpperCase(), buttons);
            sendMessage(recipientId, message);
        }
        else {
            sendMessage(recipientId, {text: "Oops! For some reason I can't find the answer for this question at the moment. Sorry about that."});
        }
    }

    utils.getQuestion(qId, afterGettingQuestion);
}
//reacts to user input 'explain'
function reactToExplainQuestion(recipientId, qId) {
    function afterGettingQuestion(error, question) {
        if (question && (question.explanation || question.explanation_image)) {
            if (question.explanation) {
                var message = createTextWithButtonsMessage(question.explanation, [{type: "postback", title: "Next", payload: "QUESTION_NEXT/" + qId}]);
                sendMessage(recipientId, message);
            }
            else if (question.explanation_image) {
                var message = createImageWithButtonsMessage("Explanation", "how the answer was gotten", 
                    BASE_URL + question.explanation_image, [{type: "postback", title: "Next", payload: "QUESTION_NEXT/" + qId}]);
                sendMessage(recipientId, message);
            }
        }
        else {
            sendMessage(recipientId, {text: "Oops! For some reason I can't find the explanation for this question at the moment. Sorry about that."});
        }
    }

    utils.getQuestion(qId, afterGettingQuestion);
}
//reacts to user input 'next'
function reactToNextQuestion(recipientId, qId) {
    var indexOfSlash = qId.indexOf('/');
    var subjid = qId.substring(0, indexOfSlash);

    function afterGettingQuestion(error, question) {
        if (question) {
            sendQuestion(recipientId, question);
        }
        else {
            sendMessage(recipientId, {text: "Oops! For some reason I can't find a random question for you at the moment. Sorry about that."});
        }
    }

    utils.getRandomQuestion(subjid, afterGettingQuestion);
}
//reacts to user input 'wrong' or 'report'
function reactToReportQuestion(recipientId, qId) {
    var message = createTextWithButtonsMessage("Wow! I will have to review this question later.", 
        [{type: "postback", title: "Next", payload: "QUESTION_NEXT/" + qId}]);
    sendMessage(recipientId, message);
}

//send a message when user attempts a question
function sendAnswerQuestion(recipientId, qId, option) {
    function afterGettingQuestion(error, question) {
        if (question && question.answer) {
            var message = createMessageForAnswer(question, question.answer.toLowerCase() == option.toLowerCase());
            sendMessage(recipientId, message);
        }
        else {
            sendMessage(recipientId, {text: "Oops! For some reason I can't find the answer to the question at the moment. Sorry about that."});
        }
    }

    utils.getQuestion(qId, afterGettingQuestion);
}
//sends a random question from a subject
function sendSubjectQuestion(recipientId, subjId) {
    function afterGettingQuestion(error, question) {
        if (question) {
            sendQuestion(recipientId, question);
        }
        else {
            sendMessage(recipientId, {text: "Oops! For some reason I can't find a random question for you at the moment. Sorry about that."});
        }
    }

    utils.getRandomQuestion(subjId, afterGettingQuestion);
}

function sendSubjectList(recipientId) {
    var message = "I've got \nAccounting, \nAgricultural Science, \nArabic, \nBiology, \nChemistry, \nCommerce, \nChristian Religion Study, " + 
        "\nEconomics, \nEnglish Language, \nGeography, \nGovernment, \nHausa, \nHistory, \nIgbo, \nIslamic Religion Knowledge, \Literature in English, " + 
        "\nMathematics, \nPhysics, \nYoruba." +
        "\n\n(You don't have to type the full name of the subject.)";
    sendMessage(recipientId, {text: message});
}

//sends question
function sendQuestion(recipientId, question) {
    utils.setUserQuestionId(recipientId, question.id, function(error, data) {});

    function postBody() {
        //if the question has body_image or
        //if question has more than 3 options (Facebook doesn't let us create more than 3 buttons at once) or
        //if the question has an option that is not a text (like a_image)
        if (question.body_image ||
            question.options.d || 
            question.options.a_image || question.options.b_image || question.options.c_image || question.options.d_image || question.options.e_image) {

            function postOptions() {
                var messages = createMessagesForOptions(question);
                
                var index = 0;
                function postOption() {
                    if (index < messages.length) {
                        var message = messages[index];
                        sendMessage(recipientId, message);
                        index++;
                        setTimeout(postOption, 500); //wait 500ms before sending the next option... this way we have a good CHANCE facebook will post dem in order
                        //of course to make sure facebook posts them in order I could increase 500 to, say, 1000... but nahhh
                    }
                }

                postOption();
            }

            if (question.body) {
                sendMessage(recipientId, {text: question.body});
                setTimeout(postOptions, 250); //post options 250ms (which I feel is OK bcuz 'createMessagesForOptions' will add more delays) after to give body a chance of appearing first
            }
            else if (question.body_image) {
                var message = createImageMessage(BASE_URL + question.body_image);
                sendMessage(recipientId, message);
                setTimeout(postOptions, 500); //post options 500ms (which I feel is OK bcuz 'createMessagesForOptions' will add more delays) after to give body_image a chance of appearing first
            }
        } else {
            var message = createMessageForQuestion(question);
            sendMessage(recipientId, message);
        }
    }

    if (question.preamble) {
        sendMessage(recipientId, {text: question.preamble});
        setTimeout(postBody, 500); //post body of question 500ms after to give preamble a chance of appearing first
    }
    else if (question.preamble_image) {
        var message = createImageMessage(BASE_URL + question.preamble_image);
        sendMessage(recipientId, message);
        setTimeout(postBody, 1000); //post body of question 1000ms after to give preamble_image a chance of appearing first
    }
    else { //if there's no preamble just postBody()
        postBody();
    }
}

//====================================

// sends message to user
function sendMessage(recipientId, message) {
    request({
        url: "https://graph.facebook.com/v2.6/me/messages",
        qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
        method: "POST",
        json: {
            recipient: {id: recipientId},
            message: message,
        }
    }, function(error, response, body) {
        if (error) {
            console.log("Error sending message: " + response.error);
        }
    });
}
