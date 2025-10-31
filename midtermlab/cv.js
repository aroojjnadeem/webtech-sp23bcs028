$(document).ready(function(){
  // Hover effect for desktop
  $(".cv-section").hover(
    function(){
      $(this).find(".cv-details").stop(true, true).slideDown(300);
    },
    function(){
      $(this).find(".cv-details").stop(true, true).slideUp(300);
    }
  );

  // Click toggle for mobile
  $(".cv-section").on("click", function(){
    $(this).find(".cv-details").stop(true, true).slideToggle(300);
  });
});
