import { SharedNotificationDelegateCommon } from './shared-notification-delegate.common';

type DeferedPromise<T> = {
    promise: Promise<T>;
    resolve: (value?: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
};
function createDeferedPromise<T>(): DeferedPromise<T> {
    const deferred: DeferedPromise<T> = {
        promise: undefined,
        reject: undefined,
        resolve: undefined
    };

    deferred.promise = new Promise<T>((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });
    return deferred;
}

type StopNextPromise = {
    stop: () => void,
    next: () => void
} & DeferedPromise<boolean>;

function createStopNextPromise(): StopNextPromise {
    const deferred = createDeferedPromise<boolean>();
    return {
        ...deferred,
        next: () => deferred.resolve(false),
        stop: () => deferred.resolve(true)
    };
}

export interface DelegateObserver {
    userNotificationCenterDidReceiveNotificationResponseWithCompletionHandler?(center: UNUserNotificationCenter, response: UNNotificationResponse, completionHandler: () => void, stop: () => void, next: () => void): void;
    userNotificationCenterOpenSettingsForNotification?(center: UNUserNotificationCenter, notification: UNNotification, stop: () => void, next: () => void): void;
    userNotificationCenterWillPresentNotificationWithCompletionHandler?(center: UNUserNotificationCenter, notification: UNNotification, completionHandler: (p1: UNNotificationPresentationOptions) => void, stop: () => void, next: () => void): void;
}
export class SharedNotificationDelegateImpl extends SharedNotificationDelegateCommon {
    _observers: Array<{ observer: DelegateObserver, priority: number }> = [];
    private delegate: UNUserNotificationCenterDelegateImpl;

    constructor() {
        super();
        if (SharedNotificationDelegateImpl.isUNUserNotificationCenterAvailable()) {
            this.delegate = UNUserNotificationCenterDelegateImpl.initWithOwner(new WeakRef(this));
            UNUserNotificationCenter.currentNotificationCenter().delegate = this.delegate;
        }
    }

    static isUNUserNotificationCenterAvailable(): boolean {
        try {
            // available since iOS 10
            return !!UNUserNotificationCenter;
        } catch (ignore) {
            return false;
        }
    }

    addObserver(observer: DelegateObserver, priority: number = 100) {
        this._observers.push({ observer, priority });
        this._observers.sort((a , b) => a.priority > b.priority ? 1 : (a.priority < b.priority ? -1 : 0));
    }

    removeObserver(observer: DelegateObserver) {
        this._observers = this._observers.filter((v) => v.observer !== observer);
    }
}

class UNUserNotificationCenterDelegateImpl extends NSObject implements UNUserNotificationCenterDelegate {
    public static ObjCProtocols = [];

    static new(): UNUserNotificationCenterDelegateImpl {
        if (UNUserNotificationCenterDelegateImpl.ObjCProtocols.length === 0 && typeof (UNUserNotificationCenterDelegate) !== "undefined") {
            UNUserNotificationCenterDelegateImpl.ObjCProtocols.push(UNUserNotificationCenterDelegate);
        }
        return <UNUserNotificationCenterDelegateImpl>super.new();
    }

    private _owner: WeakRef<SharedNotificationDelegateImpl>;

    public static initWithOwner(owner: WeakRef<SharedNotificationDelegateImpl>): UNUserNotificationCenterDelegateImpl {
        const delegate = <UNUserNotificationCenterDelegateImpl>UNUserNotificationCenterDelegateImpl.new();
        delegate._owner = owner;
        return delegate;
    }

    public userNotificationCenterWillPresentNotificationWithCompletionHandler(center: UNUserNotificationCenter, notification: UNNotification, completionHandler: (p1: UNNotificationPresentationOptions) => void): void {
        let promise = Promise.resolve(false);
        const owner = this._owner.get();
        if (owner) {
            owner._observers.forEach(({observer}) => {
                if (observer.userNotificationCenterWillPresentNotificationWithCompletionHandler) {
                    promise = promise.then((skip: boolean) => {
                        if (skip) { return true; }
                        const defPromise = createStopNextPromise();
                        const childHandler: (p1: UNNotificationPresentationOptions) => void = (p1: UNNotificationPresentationOptions) => {
                            defPromise.stop();
                            completionHandler(p1);
                        };
                        try {
                            observer.userNotificationCenterWillPresentNotificationWithCompletionHandler(center, notification, childHandler, defPromise.stop, defPromise.next);
                        } catch (ignore) {
                            defPromise.next();
                        }
                        return defPromise.promise;
                    });
                }
            });
        }
    }

    public userNotificationCenterOpenSettingsForNotification(center: UNUserNotificationCenter, notification: UNNotification): void {
        let promise = Promise.resolve(false);
        const owner = this._owner.get();
        if (owner) {
            owner._observers.forEach(({observer}) => {
                if (observer.userNotificationCenterOpenSettingsForNotification) {
                    promise = promise.then((skip: boolean) => {
                        if (skip) { return true; }
                        const defPromise = createStopNextPromise();
                        try {
                            observer.userNotificationCenterOpenSettingsForNotification(center, notification, defPromise.stop, defPromise.next);
                        } catch (ignore) {
                            defPromise.next();
                        }
                        return defPromise.promise;
                    });
                }
            });
        }
    }

    public userNotificationCenterDidReceiveNotificationResponseWithCompletionHandler(center: UNUserNotificationCenter, response: UNNotificationResponse, completionHandler: () => void): void {
        let promise = Promise.resolve(false);
        const owner = this._owner.get();
        if (owner) {
            owner._observers.forEach(({observer}) => {
                if (observer.userNotificationCenterDidReceiveNotificationResponseWithCompletionHandler) {
                    promise = promise.then((skip: boolean) => {
                        if (skip) { return true; }
                        const defPromise = createStopNextPromise();
                        const childHandler: () => void = () => {
                            defPromise.stop();
                            completionHandler();
                        };
                        try {
                            observer.userNotificationCenterDidReceiveNotificationResponseWithCompletionHandler(center, response, childHandler, defPromise.stop, defPromise.next);
                        } catch (ignore) {
                            defPromise.next();
                        }
                        return defPromise.promise;
                    });
                }
            });
        }
    }
}

const instance = new SharedNotificationDelegateImpl();

export const SharedNotificationDelegate = instance;
