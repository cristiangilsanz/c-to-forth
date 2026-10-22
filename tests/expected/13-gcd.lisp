(defun gcd_ (a b)
  (let* ((r 0))
    (loop while (/= b 0) do
      (setf r (rem a b))
      (setf a b)
      (setf b r))
    a))

(defun main ()
  (format t "gcd(1071, 462) = ~d~%" (gcd_ 1071 462))
  (format t "gcd(270, 192) = ~d~%" (gcd_ 270 192)))

(main)
