/**
 * Created by a.korotaev on 24.06.16.
 */

import XLApi from './xlapi';
import $ from 'jquery';
/**
 * Create an `Auth0` instance with `options`
 *
 * @class XL
 * @constructor
 */

const DEFAULT_CONFIG = {
    errorHandler: function (a) {
    },
    loginPassValidator: function (a, b) {
        return true;
    },
    isMarkupSocialsHandlersEnabled: false,
    apiUrl: '//login.xsolla.com/api/',
    maxXLClickDepth: 20,
    onlyWidgets: false,
    preloader: '<div></div>'
};

const INVALID_LOGIN_ERROR_CODE = 1;
const INCORRECT_LOGIN_OR_PASSWORD_ERROR_CODE = 2;

class XL {
    constructor() {
        this.socialUrls = {};
        this.eventObject = $({});
        this.eventTypes = {
            LOAD: 'load',
            CLOSE: 'close'
        };
        this.postMessage = null;
    }

    init(options) {
        this.config = Object.assign({}, DEFAULT_CONFIG, options);
        this.api = new XLApi(options.projectId, this.config.apiUrl);

        if (!this.config.onlyWidgets) {

            let params = {};
            params.projectId = options.projectId;
            if (this.config.redirectUrl) {
                params.redirect_url = this.config.redirectUrl;
            }

            let updateSocialLinks = () => {
                this.api.getSocialsURLs((response) => {
                    this.socialUrls = {};
                    for (let key in response) {
                        if (response.hasOwnProperty(key)) {
                            this.socialUrls['sn-' + key] = response[key];
                        }
                    }
                }, (e) => {
                    console.error(e);
                }, params);
            };

            updateSocialLinks();
            setInterval(updateSocialLinks, 1000 * 60 * 59);

            let maxClickDepth = this.config.maxXLClickDepth;
            // Find closest ancestor with data-xl-auth attribute
            function findAncestor(el) {
                if (el.attributes['data-xl-auth']) {
                    return el;
                }
                let i = 0;
                while ((el = el.parentElement) && !el.attributes['data-xl-auth'] && ++i < maxClickDepth);
                return el;
            }

            if (this.config.isMarkupSocialsHandlersEnabled) {
                document.addEventListener('click', (e) => {
                    let target = findAncestor(e.target);
                    // Do nothing if click was outside of elements with data-xl-auth
                    if (!target) {
                        return;
                    }
                    let xlData = target.attributes['data-xl-auth'];
                    if (xlData) {
                        let nodeValue = xlData.nodeValue;
                        if (nodeValue) {
                            this.login({authType: nodeValue});
                        }
                    }
                });
            }
        }
    }

    /**
     * Performs login
     * @param prop
     * @param error - call in case error
     * @param success
     */
    login(prop, error, success) {

        if (!prop || !this.socialUrls) {
            return;
        }

        /**
         * props
         * authType: sn-<social name>, login-pass, sms
         */
        if (prop.authType) {
            if (prop.authType.startsWith('sn-')) {
                var socialUrl = this.socialUrls[prop.authType];
                if (socialUrl != undefined) {
                    window.location.href = this.socialUrls[prop.authType];
                } else {
                    console.error('Auth type: ' + prop.authType + ' doesn\'t exist');
                }

            } else if (prop.authType == 'login-pass') {
                this.api.loginPassAuth(prop.login, prop.pass, prop.rememberMe, this.config.redirectUrl, (res) => {
                    if (res.login_url) {
                        var finishAuth = function () {
                            window.location.href = res.login_url;
                        };
                        if (success) {
                            success({status: 'success', finish: finishAuth, redirectUrl: res.login_url});
                        } else {
                            finishAuth();
                        }
                    } else {
                        error(this.createErrorObject('Login or pass not valid', INCORRECT_LOGIN_OR_PASSWORD_ERROR_CODE));
                    }
                }, function (err) {
                    error(err);
                });
            } else if (prop.authType == 'sms') {
                if (smsAuthStep == 'phone') {
                    this.api.smsAuth(prop.phoneNumber, null, null);
                } else if (smsAuthStep == 'code') {

                }
            } else {
                console.error('Unknown auth type');
            }
        }
    }

    createErrorObject(message, code) {
        return {
            error: {
                message: message,
                code: code || -1
            }
        };
    };

    getProjectId() {
        return this.config.projectId;
    };

    getRedirectURL() {
        return this.config.redirectUrl;
    };

    AuthWidget(elementId, options) {
        if (this.api) {
            if (!elementId) {
                console.error('No div name!');
            } else {
                if (options == undefined) {
                    options = {};
                }
                let width = options.width || 400 + 'px';
                let height = options.height || 550 + 'px';

                let widgetBaseUrl = options.widgetBaseUrl || 'https://xl-widget.xsolla.com/';

                // var styleString = 'boreder:none';
                let src = widgetBaseUrl + '?projectId=' + this.getProjectId();

                if (this.config.locale) {
                    src = src + '&locale=' + this.config.locale;
                }
                if (this.config.fields) {
                    src = src + '&fields=' + this.config.fields;
                }
                let redirectUrl = this.getRedirectURL();
                if (redirectUrl) {
                    src = src + '&redirectUrl=' + encodeURIComponent(redirectUrl);
                }

                // var widgetHtml = '<iframe frameborder="0" width="'+width+'" height="'+height+'"  src="'+src+'">Not supported</iframe>';
                let widgetIframe = document.createElement('iframe');
                widgetIframe.onload = () => {
                    element.removeChild(preloader);
                    widgetIframe.style.width = '100%';
                    widgetIframe.style.height = '100%';
                    this.triggerEvent(this.eventTypes.LOAD);
                };
                widgetIframe.style.width = 0;
                widgetIframe.style.height = 0;
                widgetIframe.frameBorder = '0';
                widgetIframe.src = src;

                let eventMethod = window.addEventListener ? "addEventListener" : "attachEvent";
                let eventer = window[eventMethod];
                let messageEvent = eventMethod == "attachEvent" ? "onmessage" : "message";

                // Listen to message from child window
                eventer(messageEvent, (e) => {
                    this.triggerEvent(this.eventTypes[e.data]);
                },false);

                let preloader = document.createElement('div');

                preloader.innerHTML = this.config.preloader;

                let element = document.getElementById(elementId);
                if (element) {
                    element.style.width = width;
                    element.style.height = height;
                    element.appendChild(preloader);
                    element.appendChild(widgetIframe);
                } else {
                    console.error('Element \"' + elementId + '\" not found!');
                }

            }
        } else {
            console.error('Please run XL.init() first');
        }
    };

    triggerEvent(){
        this.eventObject.trigger.apply(this.eventObject, arguments);
    }

    on(event, handler) {
        if (!$.isFunction(handler)) {
            return;
        }

        this.eventObject.on(event, handler);
    };
}

var result = new XL();

module.exports = result;