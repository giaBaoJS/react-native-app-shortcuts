#import "AppShortcuts.h"

#import <AppShortcutsSpec/AppShortcutsSpec.h>

static NSString *const kShortcutPressedEvent = @"AppShortcuts:shortcutPressed";

// Reserved userInfo keys used to round-trip fields that
// UIApplicationShortcutItem cannot expose back (icon name) and to keep the
// user payload separate from library bookkeeping.
static NSString *const kUserInfoIconNameKey = @"__appShortcutsIconName";
static NSString *const kUserInfoDataKey = @"__appShortcutsData";

// Process-wide state. Quick action presses can arrive (via the AppDelegate)
// long before the TurboModule instance exists, so this lives in statics.
static UIApplicationShortcutItem *gInitialShortcutItem = nil;
static NSMutableArray<UIApplicationShortcutItem *> *gPendingShortcutItems = nil;
static BOOL gListenersEverAttached = NO;
static BOOL gInitialDroppedFromBuffer = NO;
static __weak AppShortcuts *gSharedInstance = nil;

static NSDictionary *AppShortcutsItemToJS(UIApplicationShortcutItem *item)
{
  NSMutableDictionary *result = [NSMutableDictionary new];
  result[@"id"] = item.type;
  result[@"title"] = item.localizedTitle ?: @"";
  if (item.localizedSubtitle != nil) {
    result[@"subtitle"] = item.localizedSubtitle;
  }
  NSDictionary *userInfo = item.userInfo;
  NSString *iconName = userInfo[kUserInfoIconNameKey];
  if ([iconName isKindOfClass:[NSString class]]) {
    result[@"iconName"] = iconName;
  }
  NSDictionary *data = userInfo[kUserInfoDataKey];
  if ([data isKindOfClass:[NSDictionary class]]) {
    result[@"data"] = data;
  }
  return result;
}

static UIApplicationShortcutItem *AppShortcutsItemFromJS(NSDictionary *json)
{
  NSString *identifier = json[@"id"];
  NSString *title = json[@"title"];
  if (![identifier isKindOfClass:[NSString class]] || identifier.length == 0 ||
      ![title isKindOfClass:[NSString class]] || title.length == 0) {
    return nil;
  }

  NSString *subtitle =
      [json[@"subtitle"] isKindOfClass:[NSString class]] ? json[@"subtitle"] : nil;
  NSString *iconName =
      [json[@"iconName"] isKindOfClass:[NSString class]] ? json[@"iconName"] : nil;
  NSDictionary *data =
      [json[@"data"] isKindOfClass:[NSDictionary class]] ? json[@"data"] : nil;

  UIApplicationShortcutIcon *icon = nil;
  if (iconName.length > 0) {
    icon = [UIApplicationShortcutIcon iconWithSystemImageName:iconName];
  }

  NSMutableDictionary<NSString *, id<NSSecureCoding>> *userInfo =
      [NSMutableDictionary new];
  if (iconName != nil) {
    userInfo[kUserInfoIconNameKey] = iconName;
  }
  if (data != nil) {
    userInfo[kUserInfoDataKey] = data;
  }

  return [[UIApplicationShortcutItem alloc] initWithType:identifier
                                          localizedTitle:title
                                       localizedSubtitle:subtitle
                                                    icon:icon
                                                userInfo:userInfo];
}

static BOOL AppShortcutsItemsEqual(UIApplicationShortcutItem *a,
                                   UIApplicationShortcutItem *b)
{
  if (a == nil || b == nil) {
    return NO;
  }
  if (![a.type isEqualToString:b.type]) {
    return NO;
  }
  NSDictionary *dataA = a.userInfo[kUserInfoDataKey] ?: @{};
  NSDictionary *dataB = b.userInfo[kUserInfoDataKey] ?: @{};
  return [dataA isEqual:dataB];
}

@interface AppShortcuts () <NativeAppShortcutsSpec>
@end

@implementation AppShortcuts {
  BOOL _hasListeners;
}

- (instancetype)init
{
  if (self = [super init]) {
    @synchronized([AppShortcuts class]) {
      gSharedInstance = self;
    }
  }
  return self;
}

+ (NSString *)moduleName
{
  return @"AppShortcuts";
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kShortcutPressedEvent ];
}

#pragma mark - Public static API (called from the host AppDelegate)

+ (BOOL)handleShortcutItem:(UIApplicationShortcutItem *)shortcutItem
{
  if (shortcutItem == nil) {
    return NO;
  }

  AppShortcuts *instance = nil;
  BOOL emitNow = NO;

  @synchronized([AppShortcuts class]) {
    if (!gListenersEverAttached && gInitialShortcutItem == nil) {
      // No JS listener has ever attached in this process: this press is the
      // one that launched (or is launching) the app.
      gInitialShortcutItem = shortcutItem;
    }
    instance = gSharedInstance;
    emitNow = instance != nil && instance->_hasListeners;
    if (!emitNow) {
      if (gPendingShortcutItems == nil) {
        gPendingShortcutItems = [NSMutableArray new];
      }
      [gPendingShortcutItems addObject:shortcutItem];
    }
  }

  if (emitNow) {
    [instance sendEventWithName:kShortcutPressedEvent
                           body:AppShortcutsItemToJS(shortcutItem)];
  }
  return YES;
}

+ (void)setInitialShortcutFromLaunchOptions:(nullable NSDictionary *)launchOptions
{
  UIApplicationShortcutItem *item =
      launchOptions[UIApplicationLaunchOptionsShortcutItemKey];
  if (![item isKindOfClass:[UIApplicationShortcutItem class]]) {
    return;
  }
  @synchronized([AppShortcuts class]) {
    if (gInitialShortcutItem == nil) {
      gInitialShortcutItem = item;
    }
  }
}

#pragma mark - RCTEventEmitter

- (void)startObserving
{
  NSArray<UIApplicationShortcutItem *> *pending = nil;
  @synchronized([AppShortcuts class]) {
    _hasListeners = YES;
    gListenersEverAttached = YES;
    pending = [gPendingShortcutItems copy];
    [gPendingShortcutItems removeAllObjects];
  }

  if (pending.count == 0) {
    return;
  }

  for (UIApplicationShortcutItem *item in pending) {
    BOOL isInitialDuplicate = NO;
    @synchronized([AppShortcuts class]) {
      if (!gInitialDroppedFromBuffer &&
          AppShortcutsItemsEqual(item, gInitialShortcutItem)) {
        // The launch press is delivered through getInitialShortcut(); do not
        // replay it as a press event as well.
        gInitialDroppedFromBuffer = YES;
        isInitialDuplicate = YES;
      }
    }
    if (!isInitialDuplicate) {
      [self sendEventWithName:kShortcutPressedEvent
                         body:AppShortcutsItemToJS(item)];
    }
  }
}

- (void)stopObserving
{
  @synchronized([AppShortcuts class]) {
    _hasListeners = NO;
  }
}

#pragma mark - NativeAppShortcutsSpec

- (void)setShortcuts:(NSArray *)shortcuts
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  NSMutableArray<UIApplicationShortcutItem *> *items = [NSMutableArray new];
  for (id entry in shortcuts) {
    if (![entry isKindOfClass:[NSDictionary class]]) {
      reject(@"invalid_shortcut", @"Each shortcut must be an object", nil);
      return;
    }
    UIApplicationShortcutItem *item = AppShortcutsItemFromJS(entry);
    if (item == nil) {
      reject(@"invalid_shortcut",
             @"Each shortcut must have a non-empty string id and title", nil);
      return;
    }
    [items addObject:item];
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication sharedApplication].shortcutItems = items;
    resolve(nil);
  });
}

- (void)clearShortcuts:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication sharedApplication].shortcutItems = @[];
    resolve(nil);
  });
}

- (void)getShortcuts:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSArray<UIApplicationShortcutItem *> *items =
        [UIApplication sharedApplication].shortcutItems ?: @[];
    NSMutableArray *result = [NSMutableArray arrayWithCapacity:items.count];
    for (UIApplicationShortcutItem *item in items) {
      [result addObject:AppShortcutsItemToJS(item)];
    }
    resolve(result);
  });
}

- (void)getInitialShortcut:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  UIApplicationShortcutItem *item = nil;
  @synchronized([AppShortcuts class]) {
    item = gInitialShortcutItem;
  }
  resolve(item != nil ? AppShortcutsItemToJS(item) : nil);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppShortcutsSpecJSI>(params);
}

@end
